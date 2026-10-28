'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  GenerationDTO,
  GenerationImageDTO,
  GenerationStatus,
} from '@/types/generator';

const TERMINAL: GenerationStatus[] = [
  'SUCCEEDED',
  'PARTIAL',
  'FAILED',
  'CANCELED',
];

export interface StreamState {
  status: GenerationStatus | null;
  images: GenerationImageDTO[];
  batchCount: number;
  succeededCount: number;
  failedCount: number;
  creditsHeld: number;
  creditsSpent: number;
  creditsRefunded: number;
  costPerImage: number;
  seed: string | null;
  errorMessage: string | null;
  /** 已收到终态 */
  finished: boolean;
}

const EMPTY: StreamState = {
  status: null,
  images: [],
  batchCount: 0,
  succeededCount: 0,
  failedCount: 0,
  creditsHeld: 0,
  creditsSpent: 0,
  creditsRefunded: 0,
  costPerImage: 0,
  seed: null,
  errorMessage: null,
  finished: false,
};

function fromDetail(g: GenerationDTO): StreamState {
  return {
    status: g.status,
    images: g.images,
    batchCount: g.batchCount,
    succeededCount: g.succeededCount,
    failedCount: g.failedCount,
    creditsHeld: g.creditsHeld,
    creditsSpent: g.creditsSpent,
    creditsRefunded: g.creditsRefunded,
    costPerImage: g.costPerImage,
    seed: g.seed,
    errorMessage: g.errorMessage,
    finished: TERMINAL.includes(g.status),
  };
}

/**
 * 一次生成的进度流。
 *
 * 首选 SSE（逐张推送），连续两次连接失败后降级为轮询 ——
 * 移动网络和反向代理下 EventSource 的长连接常常撑不住，
 * 而任务本身在服务端照跑，前端不该因此卡在转圈上。
 *
 * 用 `failed` 而不是 `error` 作为失败事件名，因为 EventSource 内建了
 * 同名的连接错误事件，两者无法区分。
 */
export function useGenerationStream(id: string | null) {
  const [state, setState] = useState<StreamState>(EMPTY);
  const [isLive, setIsLive] = useState(false);

  const patch = useCallback((p: Partial<StreamState>) => {
    setState((s) => ({ ...s, ...p }));
  }, []);

  const upsertImage = useCallback((img: GenerationImageDTO) => {
    setState((s) => {
      const rest = s.images.filter((i) => i.id !== img.id);
      return {
        ...s,
        images: [...rest, img].sort((a, b) => a.index - b.index),
      };
    });
  }, []);

  useEffect(() => {
    if (!id) {
      setState(EMPTY);
      setIsLive(false);
      return;
    }

    let cancelled = false;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = 3000;
    let degradations = 0;

    setState(EMPTY);
    setIsLive(true);

    const stop = () => {
      es?.close();
      es = null;
      if (timer) clearTimeout(timer);
      timer = null;
      if (!cancelled) setIsLive(false);
    };

    const fetchDetail = async () => {
      try {
        const res = await fetch(`/api/generations/${id}`);
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { ok: boolean; data: GenerationDTO };
        if (cancelled || !json.ok) return false;
        const next = fromDetail(json.data);
        setState(next);
        return next.finished;
      } catch {
        return false;
      }
    };

    /** 降级路径：轮询详情接口 */
    const poll = async () => {
      const done = await fetchDetail();
      if (cancelled) return;
      if (done) return stop();
      delay = Math.min(delay * 1.6, 10_000);
      timer = setTimeout(poll, delay);
    };

    const startPolling = () => {
      if (cancelled || timer) return;
      es?.close();
      es = null;
      delay = 3000;
      void poll();
    };

    void (async () => {
      // 先拉一次详情：已完成的生成立刻出结果，不走 SSE
      const done = await fetchDetail();
      if (cancelled || done) {
        if (!cancelled) setIsLive(false);
        return;
      }

      es = new EventSource(`/api/generations/${id}/events`);

      es.addEventListener('status', (e) => {
        const d = JSON.parse((e as MessageEvent).data);
        patch({
          status: d.status,
          batchCount: d.batchCount,
          succeededCount: d.succeededCount,
          failedCount: d.failedCount,
          creditsHeld: d.creditsHeld,
          creditsSpent: d.creditsSpent,
          creditsRefunded: d.creditsRefunded,
        });
      });

      es.addEventListener('image', (e) => {
        upsertImage(JSON.parse((e as MessageEvent).data));
      });

      es.addEventListener('done', (e) => {
        const d = JSON.parse((e as MessageEvent).data);
        patch({
          status: d.status,
          succeededCount: d.succeededCount,
          failedCount: d.failedCount,
          creditsSpent: d.creditsSpent,
          creditsRefunded: d.creditsRefunded,
          errorMessage: d.errorMessage ?? null,
          finished: true,
        });
        stop();
      });

      es.addEventListener('failed', (e) => {
        const d = JSON.parse((e as MessageEvent).data);
        patch({ finished: true, status: 'FAILED', errorMessage: d.message });
        stop();
      });

      // 这里只可能是连接层错误；任务失败走上面的 `failed` 事件
      es.onerror = () => {
        if (cancelled) return;
        degradations += 1;
        if (degradations >= 2) {
          // 让最后一次详情请求兜底，避免刚好在终态边缘误判
          void fetchDetail().then((finished) => {
            if (finished) stop();
            else startPolling();
          });
        }
      };
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [id, patch, upsertImage]);

  return { ...state, isLive };
}

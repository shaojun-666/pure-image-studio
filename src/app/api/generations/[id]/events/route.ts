import { requireUser } from '@/server/auth/guards';
import { prisma } from '@/server/db';
import { isTerminal, serializeImage } from '@/server/generation/queries';
import { fail, toErrorResponse } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** DB 尾随间隔 */
const TICK_MS = 700;
/** 心跳间隔，防止 Nginx / 浏览器把长连接当死连接掐掉 */
const PING_MS = 15_000;
/** 连接最长存活时间 */
const MAX_LIFETIME_MS = 10 * 60 * 1000;

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(t);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const t = setTimeout(done, ms);
    if (signal.aborted) done();
    else signal.addEventListener('abort', done, { once: true });
  });
}

/**
 * SSE 进度流。
 *
 * 实现是 DB 尾随循环而不是 Redis pub/sub —— 应用只有一个容器，
 * 为此引入一个中间件不划算。多实例时换成 Postgres LISTEN/NOTIFY，协议不用改。
 *
 * 事件：status / image / done / failed
 *
 * ★ 失败事件刻意叫 `failed` 而不是 `error`：EventSource 内建的同名事件
 *   表示「连接断了」，两者用 addEventListener('error') 根本无法区分。
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;

    const exists = await prisma.generation.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!exists) return fail('NOT_FOUND', '生成记录不存在', 404);

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        req.signal.addEventListener('abort', () => {
          closed = true;
        });

        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        };

        const seen = new Set<string>();
        let lastStatus = '';
        let lastPing = Date.now();
        const until = Date.now() + MAX_LIFETIME_MS;

        while (!closed && Date.now() < until) {
          const gen = await prisma.generation.findUnique({ where: { id } });
          if (!gen) {
            send('failed', { code: 'NOT_FOUND', message: '生成记录已被删除' });
            break;
          }

          const rows = await prisma.generationImage.findMany({
            where: { generationId: id },
            orderBy: { index: 'asc' },
          });

          if (gen.status !== lastStatus) {
            lastStatus = gen.status;
            send('status', {
              status: gen.status,
              batchCount: gen.batchCount,
              succeededCount: gen.succeededCount,
              failedCount: gen.failedCount,
              creditsHeld: gen.creditsHeld,
              creditsSpent: gen.creditsSpent,
              creditsRefunded: gen.creditsRefunded,
            });
          }

          for (const row of rows) {
            if (seen.has(row.id)) continue;
            seen.add(row.id);
            send('image', await serializeImage(row));
          }

          if (isTerminal(gen.status)) {
            send('done', {
              status: gen.status,
              succeededCount: gen.succeededCount,
              failedCount: gen.failedCount,
              creditsSpent: gen.creditsSpent,
              creditsRefunded: gen.creditsRefunded,
              errorCode: gen.errorCode,
              errorMessage: gen.errorMessage,
            });
            break;
          }

          if (Date.now() - lastPing >= PING_MS) {
            lastPing = Date.now();
            controller.enqueue(encoder.encode(': ping\n\n'));
          }

          await wait(TICK_MS, req.signal);
        }

        try {
          controller.close();
        } catch {
          /* 客户端已断开 */
        }
      },
    });

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        // Nginx 必须关掉缓冲，否则进度会攒到最后一次性刷出来
        'x-accel-buffering': 'no',
      },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}

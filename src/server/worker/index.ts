import { randomUUID } from 'node:crypto';
import { executeClaimed } from '../generation/executor';
import { env } from '../env';
import { logger } from '../logger';
import { claimOne } from './claim';

/** 轮询间隔：兜底 reaper、异步 nextPollAt、以及丢失通知的任务 */
const TICK_MS = 1000;
const MAX_ROUNDS = 100;

const workerId = `${process.pid}-${randomUUID().slice(0, 8)}`;

let ticking = false;
let again = false;
let timer: NodeJS.Timeout | null = null;

async function runOne(): Promise<boolean> {
  const gen = await claimOne(workerId);
  if (!gen) return false;
  try {
    await executeClaimed(gen);
  } catch (e) {
    // 租约到期后会被重新领取，这里只记录
    logger.error('executeClaimed threw', {
      generationId: gen.id,
      message: e instanceof Error ? e.message : String(e),
    });
  }
  return true;
}

async function drain(): Promise<void> {
  if (ticking) {
    again = true;
    return;
  }
  ticking = true;
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      again = false;
      const claimed = await Promise.all(
        Array.from({ length: env.WORKER_CONCURRENCY }, () => runOne()),
      );
      if (!claimed.some(Boolean) && !again) break;
    }
  } finally {
    ticking = false;
  }
}

/** 提交后立即唤醒，不必干等下一次 tick */
export function notifyWorker(): void {
  void drain().catch((e) =>
    logger.error('worker drain failed', {
      message: e instanceof Error ? e.message : String(e),
    }),
  );
}

export function startWorker(): void {
  if (timer) return;
  timer = setInterval(() => notifyWorker(), TICK_MS);
  timer.unref();
  notifyWorker();
  logger.info('worker started', {
    workerId,
    concurrency: env.WORKER_CONCURRENCY,
    tickMs: TICK_MS,
  });
}

export function stopWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

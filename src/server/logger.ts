import { env } from './env';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const threshold = LEVELS[env.LOG_LEVEL];

function emit(level: Level, msg: string, meta?: unknown) {
  if (LEVELS[level] < threshold) return;
  const line = {
    t: new Date().toISOString(),
    level,
    msg,
    ...(meta && typeof meta === 'object' ? { meta } : {}),
  };
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  out(JSON.stringify(line));
}

export const logger = {
  debug: (msg: string, meta?: unknown) => emit('debug', msg, meta),
  info: (msg: string, meta?: unknown) => emit('info', msg, meta),
  warn: (msg: string, meta?: unknown) => emit('warn', msg, meta),
  error: (msg: string, meta?: unknown) => emit('error', msg, meta),
};

/** 传给 provider 的日志器，带上请求上下文 */
export function scopedLogger(scope: Record<string, unknown>) {
  const withScope = (meta?: unknown) =>
    meta && typeof meta === 'object' ? { ...scope, ...meta } : scope;
  return {
    debug: (m: string, x?: unknown) => logger.debug(m, withScope(x)),
    info: (m: string, x?: unknown) => logger.info(m, withScope(x)),
    warn: (m: string, x?: unknown) => logger.warn(m, withScope(x)),
    error: (m: string, x?: unknown) => logger.error(m, withScope(x)),
  };
}

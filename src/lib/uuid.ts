/**
 * 生成一个 UUID v4 字符串。
 *
 * ★ 刻意不用 `crypto.randomUUID()`：那个方法**只在安全上下文里存在**
 *   （HTTPS 或 localhost）。本站部署是 `http://<公网IP>:8080`，明文 HTTP，
 *   于是 `crypto.randomUUID` 是 `undefined`，调用直接抛 TypeError。
 *
 *   而它是在拼请求体时抛的 —— 在 fetch 之前，又不是 ApiClientError，
 *   所以被提交处的兜底分支吞成一句笼统的「提交失败，请稍后重试」：
 *   服务端连请求都收不到，日志里一条异常都没有，无从查起。
 *   （同 copy-button.tsx 里 clipboard 那个坑，都是安全上下文的限制。）
 *
 * `crypto.getRandomValues` 没有这个限制，而这里要的只是个幂等键，够用。
 */
export function uuid(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

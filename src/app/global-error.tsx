'use client';

import * as React from 'react';

/**
 * 最后一道兜底：只在 **根 layout 自身**抛错时接管。
 *
 * 为什么必须自己渲染 <html>/<body>：Next 用它**整个替换**根 layout，
 * 所以这一刻没有 Provider、没有 next-intl（拿不到翻译），也不能依赖
 * globals.css 里那套 token —— 因此这里全部用内联样式 + 双语硬编码，
 * 与 app/not-found.tsx 同样的取舍。
 *
 * 色值取自 globals.css 的 token（--background / --primary 等）手抄，
 * 因为这条路走不到 CSS 变量：浅紫 #9654F2 对应 --primary: 265 86% 64%。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error('[global error boundary]', error);
  }, [error]);

  return (
    <html lang="zh" className="dark">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background: '#07070d',
          color: '#f2f2f7',
          fontFamily: 'system-ui, sans-serif',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 440, textAlign: 'center' }}>
          <p style={{ fontSize: 40, margin: 0, lineHeight: 1 }}>⚠</p>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginTop: 16 }}>
            服务暂时不可用
          </h1>
          <p style={{ color: '#8b8b9e', fontSize: 14, marginTop: 8, lineHeight: 1.7 }}>
            Service temporarily unavailable. Please retry in a moment.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              padding: '10px 22px',
              borderRadius: 12,
              border: 'none',
              background: '#9654f2',
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            重试 / Retry
          </button>

          {error.digest && (
            <p
              style={{
                marginTop: 20,
                fontFamily: 'ui-monospace, monospace',
                fontSize: 11,
                color: '#5c5c6e',
              }}
            >
              {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}

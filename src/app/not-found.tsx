import Link from 'next/link';

/**
 * 全局 404。它不经过 [locale] layout，所以必须自己渲染 html/body
 * （next-intl 的标准做法）。
 */
export default function GlobalNotFound() {
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
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 56, fontWeight: 600, margin: 0 }}>404</p>
          <p style={{ color: '#8b8b9e', marginTop: 8 }}>页面不存在 / Page not found</p>
          <Link
            href="/zh"
            style={{
              display: 'inline-block',
              marginTop: 24,
              padding: '10px 22px',
              borderRadius: 12,
              background: '#7c4dff',
              color: '#fff',
              textDecoration: 'none',
            }}
          >
            返回首页
          </Link>
        </div>
      </body>
    </html>
  );
}

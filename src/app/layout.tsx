import type { ReactNode } from 'react';
import './globals.css';

/**
 * 根 layout 只做透传：真正的 <html>/<body> 在 app/[locale]/layout.tsx 里，
 * 这样 lang 属性才能跟随语言（next-intl 的标准做法）。
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}

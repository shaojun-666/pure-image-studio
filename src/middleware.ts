import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// 这里只挂 next-intl。auth() 放在 middleware 会把 Prisma adapter 拖进 Edge runtime，
// 鉴权一律落在 layout / guards（Node runtime）。
export default createMiddleware(routing);

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};

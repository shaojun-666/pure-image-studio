import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = routing.locales.includes(requested as never)
    ? (requested as string)
    : routing.defaultLocale;

  return {
    locale,
    // 固定单一时区：保证 SSR 与客户端渲染一致，否则会 hydration 不匹配
    timeZone: 'Asia/Shanghai',
    now: new Date(),
    messages: (await import(`../../messages/${locale}.json`)).default,
    formats: {
      number: { credits: { maximumFractionDigits: 0 } },
      dateTime: {
        short: { year: 'numeric', month: 'short', day: 'numeric' },
      },
    },
    onError(error) {
      if (process.env.NODE_ENV !== 'production') console.error(error);
    },
    getMessageFallback({ key, namespace }) {
      return namespace ? `${namespace}.${key}` : key;
    },
  };
});

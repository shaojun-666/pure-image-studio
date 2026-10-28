import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * 用「星号匹配语言段」的通配前缀，而不是逐语言列举 ——
 * 将来加语言时这里不必跟着改。
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/*/account',
          '/*/account/',
          '/*/history',
          '/*/admin',
          '/*/login',
          '/*/register',
          '/*/reset-password',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

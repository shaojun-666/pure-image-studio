import type { Metadata } from 'next';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);

export function absoluteUrl(locale: string, path: string) {
  return `${SITE_URL}/${locale}${path === '/' ? '' : path}`;
}

/** zh/en + x-default 的 hreflang 交替链接，所有页面共用。 */
export function alternates(locale: string, path: string) {
  return {
    canonical: absoluteUrl(locale, path),
    languages: {
      zh: absoluteUrl('zh', path),
      en: absoluteUrl('en', path),
      'x-default': absoluteUrl('zh', path),
    },
  };
}

export function buildMetadata({
  locale,
  path,
  title,
  description,
  noIndex,
}: {
  locale: string;
  path: string;
  title: string;
  description?: string;
  noIndex?: boolean;
}): Metadata {
  return {
    title,
    description,
    alternates: alternates(locale, path),
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
  };
}

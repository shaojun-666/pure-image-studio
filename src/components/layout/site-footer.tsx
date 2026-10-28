import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { Link } from '@/i18n/navigation';

export function SiteFooter() {
  const t = useTranslations('footer');
  const tn = useTranslations('nav');
  const tc = useTranslations('common');

  const columns = [
    {
      title: t('product'),
      links: [
        { href: '/generate', label: tn('generate') },
        { href: '/explore', label: tn('explore') },
        { href: '/tools', label: tn('tools') },
        { href: '/pricing', label: tn('pricing') },
      ],
    },
    {
      title: t('resources'),
      links: [
        { href: '/how-to-use', label: t('howToUse') },
        { href: '/faq', label: t('faq') },
        { href: '/blog', label: t('blog') },
      ],
    },
    {
      title: t('company'),
      links: [{ href: '/about', label: tn('about') }],
    },
    {
      title: t('legal'),
      links: [
        { href: '/terms', label: t('terms') },
        { href: '/privacy', label: t('privacy') },
      ],
    },
  ];

  return (
    <footer className="mt-24 border-t border-border/60">
      <div className="container py-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-primary to-accent">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </span>
              <span className="text-sm font-semibold">{tc('brand')}</span>
            </div>
            <p className="max-w-xs text-sm text-muted-foreground">
              {tc('brandSuffix')}
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.title} className="space-y-3">
              <p className="text-sm font-medium">{col.title}</p>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {tc('brand')}. {t('rights')}
          </p>
          {/* ICP 备案号位：拿到备案号后替换 */}
          <p>{t('icp')}</p>
        </div>
      </div>
    </footer>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { CreditBadge } from '@/components/layout/credit-badge';
import { UserMenu } from '@/components/layout/user-menu';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/explore', key: 'explore' },
  { href: '/generate', key: 'generate' },
  { href: '/tools', key: 'tools' },
  { href: '/pricing', key: 'pricing' },
  { href: '/about', key: 'about' },
] as const;

export function SiteHeader() {
  const t = useTranslations('nav');
  const tc = useTranslations('common');
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full transition-all duration-300',
        scrolled && 'glass border-b border-border/60',
      )}
    >
      <div className="container flex h-16 items-center gap-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="relative grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-accent">
            <Sparkles className="h-4 w-4 text-white" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">
            {tc('brand')}
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  active
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(item.key)}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LocaleSwitcher />
          <CreditBadge />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { Coins, FolderHeart, LayoutDashboard, Palette, Settings, Users } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/account', key: 'overview', icon: LayoutDashboard },
  { href: '/account/credits', key: 'credits', icon: Coins },
  // 集合是这里唯一有子页的项（/account/collections/[id]），所以单独标记按前缀点亮
  { href: '/account/collections', key: 'collections', icon: FolderHeart, prefix: true },
  { href: '/account/styles', key: 'styles', icon: Palette },
  { href: '/account/characters', key: 'characters', icon: Users },
  { href: '/account/settings', key: 'settings', icon: Settings },
] as const;

/** 账户区左侧分栏。窄屏横滑，宽屏竖排。 */
export function AccountNav() {
  const t = useTranslations('account.nav');
  // 带 locale 感知的 pathname，形如 /account/credits
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {ITEMS.map(({ href, key, icon: Icon, ...rest }) => {
        // 默认精确匹配，否则 /account/credits 也会点亮「概览」。
        // 只有显式标了 prefix 的项才吃子路径。
        const prefix = 'prefix' in rest && rest.prefix;
        const active = prefix
          ? pathname === href || pathname.startsWith(`${href}/`)
          : pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-primary/15 text-foreground'
                : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" />
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}

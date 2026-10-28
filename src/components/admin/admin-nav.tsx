'use client';

import { useTranslations } from 'next-intl';
import {
  Coins,
  Cpu,
  Images,
  LayoutDashboard,
  MessageSquareText,
  Palette,
  Users,
} from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/admin', key: 'dashboard', icon: LayoutDashboard },
  { href: '/admin/explore', key: 'explore', icon: Images },
  { href: '/admin/models', key: 'models', icon: Cpu },
  { href: '/admin/styles', key: 'styles', icon: Palette },
  { href: '/admin/prompts', key: 'prompts', icon: MessageSquareText },
  { href: '/admin/users', key: 'users', icon: Users },
  { href: '/admin/generations', key: 'generations', icon: Coins },
] as const;

/** 后台左侧分栏，与 AccountNav 同构。窄屏横滑，宽屏竖排。 */
export function AdminNav() {
  const t = useTranslations('admin.nav');
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {ITEMS.map(({ href, key, icon: Icon }) => {
        // 看板是前缀，必须精确匹配，否则每个子页都会点亮它
        const active = pathname === href;
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

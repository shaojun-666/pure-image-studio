'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { signOut } from 'next-auth/react';
import { User, Users, History, LogOut, Shield, ChevronDown } from 'lucide-react';
import { Popover } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { useMe } from '@/lib/hooks/use-catalog';

export function UserMenu() {
  const t = useTranslations('nav');
  const [open, setOpen] = React.useState(false);
  const { data: me, isPending } = useMe();

  if (isPending) return <Skeleton className="size-9 rounded-full" />;

  if (!me) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/login"
          className="hidden rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
        >
          {t('login')}
        </Link>
        <Link
          href="/register"
          className="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          {t('register')}
        </Link>
      </div>
    );
  }

  const items = [
    { href: '/account', icon: User, label: t('account') },
    // 形象页原本只在账户区的侧栏里，窄屏时那栏是横滑的、末几项看不见 —— 菜单里补一个直达入口
    { href: '/account/characters', icon: Users, label: t('characters') },
    { href: '/history', icon: History, label: t('history') },
    ...(me.role === 'ADMIN'
      ? [{ href: '/admin', icon: Shield, label: t('admin') }]
      : []),
  ] as const;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      contentClassName="w-56"
      trigger={
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-full border border-border/70 p-0.5 pr-1.5 transition-colors hover:border-primary/40"
        >
          <span className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-xs font-semibold text-white">
            {(me.name ?? me.email).slice(0, 1).toUpperCase()}
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      }
    >
      <div className="border-b border-border/70 px-2.5 py-2">
        <p className="truncate text-sm font-medium">{me.name ?? me.email.split('@')[0]}</p>
        <p className="truncate text-xs text-muted-foreground">{me.email}</p>
      </div>

      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-accent/10"
        >
          <item.icon className="size-4 text-muted-foreground" />
          {item.label}
        </Link>
      ))}

      <button
        type="button"
        onClick={() => void signOut({ callbackUrl: '/' })}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground"
      >
        <LogOut className="size-4" />
        {t('logout')}
      </button>
    </Popover>
  );
}

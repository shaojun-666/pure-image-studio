'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { cn } from '@/lib/utils';

/** 后台七页的页头，统一标题/说明/右侧操作区 */
export function AdminPage({
  title,
  hint,
  actions,
  children,
}: {
  title: string;
  hint?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

/** 带防抖的搜索框。后台列表都在服务端筛，输入即打请求会打爆接口 */
export function AdminSearch({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  const [raw, setRaw] = React.useState(value);
  const debounced = useDebounce(raw, 300);

  React.useEffect(() => {
    if (debounced !== value) onChange(debounced);
  }, [debounced, value, onChange]);

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
      />
    </div>
  );
}

export function AdminTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full min-w-[44rem] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'whitespace-nowrap border-b border-border/60 bg-secondary/30 px-3 py-2.5 text-left text-xs font-medium text-muted-foreground',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <td className={cn('border-b border-border/40 px-3 py-2.5 align-middle', className)}>
      {children}
    </td>
  );
}

export function AdminEmpty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 px-6 py-12 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

export function AdminLoading({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-11 w-full rounded-lg" />
      ))}
    </div>
  );
}

/** 状态徽章：后台表格里到处都要用，颜色按语义分组 */
const STATUS_VARIANT: Record<string, 'default' | 'success' | 'danger' | 'muted' | 'accent'> = {
  PUBLISHED: 'success',
  SUCCEEDED: 'success',
  ACTIVE: 'success',
  ADMIN: 'accent',
  DRAFT: 'muted',
  QUEUED: 'muted',
  PENDING: 'muted',
  CANCELED: 'muted',
  ARCHIVED: 'muted',
  USER: 'muted',
  BANNED: 'danger',
  FAILED: 'danger',
  RUNNING: 'default',
  PARTIAL: 'default',
};

export function StatusBadge({ value, label }: { value: string; label: string }) {
  return <Badge variant={STATUS_VARIANT[value] ?? 'muted'}>{label}</Badge>;
}

/** 时间统一按北京时间显示，免得运营对着 UTC 换算 */
export function AdminTime({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="whitespace-nowrap tabular-nums text-muted-foreground">
      {new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(iso))}
    </span>
  );
}

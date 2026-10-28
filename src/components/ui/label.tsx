import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * 表单标签的唯一实现。
 *
 * ★ 从前 ui/input.tsx 里另有一份同名同角色的 Label，样式却不一样
 *   （那边 text-sm/text-foreground/90，这边 text-xs/text-muted-foreground）：
 *   同一个视觉角色长什么样，取决于调用方当初从哪个路径 import —— 登录注册页
 *   和后台用户页的标签因此一个大一个小。现在只留这一份，input.tsx 改为再导出。
 *   样式取的是原来 input.tsx 那份：登录/注册是主要门面，不改它的观感。
 */
export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        'text-sm font-medium leading-none text-foreground/90',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className,
      )}
      {...props}
    />
  );
}

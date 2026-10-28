import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-primary/15 text-primary ring-1 ring-inset ring-primary/25',
        accent: 'bg-accent/15 text-accent ring-1 ring-inset ring-accent/25',
        muted: 'bg-secondary text-muted-foreground',
        outline: 'text-muted-foreground ring-1 ring-inset ring-border',
        success:
          'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/25',
        danger:
          'bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/25',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };

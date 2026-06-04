import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors',
  {
    variants: {
      variant: {
        default:     'border-border bg-surface text-foreground',
        primary:     'border-primary/40 bg-primary/10 text-primary',
        success:     'border-success/40 bg-success/10 text-success',
        warning:     'border-warning/40 bg-warning/10 text-warning',
        destructive: 'border-destructive/40 bg-destructive/10 text-destructive',
        info:        'border-info/40 bg-info/10 text-info',
        hot:         'border-hot/30 bg-hot/10 text-hot',
        muted:       'border-border bg-surface text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };

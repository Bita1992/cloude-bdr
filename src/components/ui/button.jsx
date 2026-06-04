import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        default:     'bg-primary text-primary-foreground hover:brightness-110',
        secondary:   'bg-surface border border-border text-foreground hover:bg-surface-2',
        ghost:       'text-muted-foreground hover:text-foreground hover:bg-surface',
        destructive: 'bg-destructive text-destructive-foreground hover:brightness-110',
        success:     'bg-success text-primary-foreground hover:brightness-110',
        outline:     'border border-border bg-transparent hover:bg-surface text-foreground',
        link:        'text-primary underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        default: 'h-9 px-4',
        sm:      'h-7 px-3 text-xs',
        lg:      'h-11 px-5 text-base',
        icon:    'h-9 w-9',
        'icon-sm': 'h-7 w-7',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };

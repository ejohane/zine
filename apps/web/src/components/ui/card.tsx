import * as React from 'react';
import {
  Colors,
  Radius,
  getSurfaceBackgroundColor,
  getSurfaceBorderColor,
} from '@zine/design-system';

import { cn } from '@/lib/utils';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'text-card-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.03),var(--shadow)]',
        className
      )}
      style={{
        borderRadius: Radius.lg,
        backgroundColor: getSurfaceBackgroundColor(Colors.dark, 'elevated'),
        borderColor: getSurfaceBorderColor(Colors.dark, 'elevated', 'default'),
        borderWidth: 1,
        ...style,
      }}
      {...props}
    />
  )
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-lg font-semibold tracking-[-0.02em] text-foreground', className)}
      {...props}
    />
  )
);
CardTitle.displayName = 'CardTitle';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

export { Card, CardContent, CardHeader, CardTitle };

import * as React from 'react';
import { Sheet as SilkSheet } from '@silk-hq/components';
import { cn } from '../../../lib/utils';

export interface SheetProps {
  children: React.ReactNode;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const Sheet = React.forwardRef<HTMLDivElement, SheetProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('silk-sheet-wrapper', className)} {...props}>
        {children}
      </div>
    );
  }
);

Sheet.displayName = 'Sheet';

export const SheetRoot = SilkSheet.Root;
export const SheetTrigger = SilkSheet.Trigger;
export const SheetPortal = SilkSheet.Portal;
export const SheetView = SilkSheet.View;
export const SheetBackdrop = SilkSheet.Backdrop;
export const SheetContent = SilkSheet.Content;
export const SheetHandle = SilkSheet.Handle;
export const SheetTitle = SilkSheet.Title;
export const SheetDescription = SilkSheet.Description;
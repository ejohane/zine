import * as React from 'react';
import {
  SheetRoot,
  SheetTrigger,
  SheetPortal,
  SheetView,
  SheetBackdrop,
  SheetContent,
  SheetHandle
} from '../Sheet';
import { cn } from '../../../lib/utils';

export interface LongSheetProps {
  trigger?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
  footer?: React.ReactNode;
  initialHeight?: 'auto' | 'full';
}

export const LongSheet: React.FC<LongSheetProps> = ({
  trigger,
  children,
  title,
  description,
  className,
  footer,
  initialHeight = 'auto'
}) => {
  return (
    <SheetRoot license="commercial">
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetPortal>
        <SheetView>
          <SheetBackdrop className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <SheetContent 
            className={cn(
              "fixed bottom-0 left-0 right-0 z-50",
              "bg-white dark:bg-gray-900",
              "rounded-t-[20px]",
              "shadow-xl",
              initialHeight === 'full' ? "h-[95vh]" : "max-h-[95vh]",
              "flex flex-col",
              className
            )}
          >
            <div className="flex-shrink-0 p-4 pb-0">
              <SheetHandle className="mx-auto mb-4 h-1 w-12 rounded-full bg-gray-300 dark:bg-gray-600" />
              
              {(title || description) && (
                <div className="mb-4">
                  {title && (
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      {description}
                    </p>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto px-4">
              {children}
            </div>
            
            {footer && (
              <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                {footer}
              </div>
            )}
          </SheetContent>
        </SheetView>
      </SheetPortal>
    </SheetRoot>
  );
};
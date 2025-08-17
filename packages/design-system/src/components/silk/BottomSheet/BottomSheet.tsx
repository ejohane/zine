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

export interface BottomSheetProps {
  trigger?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  trigger,
  children,
  title,
  description,
  className
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
              "max-h-[90vh]",
              "overflow-hidden",
              className
            )}
          >
            <div className="p-4">
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
              
              <div className="overflow-y-auto max-h-[calc(90vh-8rem)]">
                {children}
              </div>
            </div>
          </SheetContent>
        </SheetView>
      </SheetPortal>
    </SheetRoot>
  );
};
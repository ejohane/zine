import * as React from 'react';
import {
  SheetRoot,
  SheetTrigger,
  SheetPortal,
  SheetView,
  SheetBackdrop,
  SheetContent
} from '../Sheet';
import { cn } from '../../../lib/utils';
import { X } from 'lucide-react';

export interface DetachedSheetProps {
  trigger?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
  position?: 'center' | 'top' | 'bottom';
  size?: 'sm' | 'md' | 'lg' | 'full';
  showCloseButton?: boolean;
}

export const DetachedSheet: React.FC<DetachedSheetProps> = ({
  trigger,
  children,
  title,
  description,
  className,
  position = 'center',
  size = 'md',
  showCloseButton = true
}) => {
  const sizeClasses = {
    sm: 'max-w-sm max-h-[50vh]',
    md: 'max-w-md max-h-[70vh]',
    lg: 'max-w-lg max-h-[80vh]',
    full: 'max-w-[90vw] max-h-[90vh]',
  };

  const positionClasses = {
    center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
    top: 'top-8 left-1/2 -translate-x-1/2',
    bottom: 'bottom-8 left-1/2 -translate-x-1/2',
  };

  return (
    <SheetRoot license="commercial">
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetPortal>
        <SheetView>
          <SheetBackdrop className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <SheetContent 
            className={cn(
              "fixed z-50",
              "bg-white dark:bg-gray-900",
              "rounded-2xl",
              "shadow-2xl",
              "overflow-hidden",
              "w-[calc(100vw-2rem)]",
              sizeClasses[size],
              positionClasses[position],
              className
            )}
          >
            <div className="relative h-full flex flex-col">
              {showCloseButton && (
                <button 
                  className="absolute top-4 right-4 z-10 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              
              <div className="p-6">
                {(title || description) && (
                  <div className="mb-4">
                    {title && (
                      <h2 className="text-xl font-semibold text-gray-900 dark:text-white pr-8">
                        {title}
                      </h2>
                    )}
                    {description && (
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        {description}
                      </p>
                    )}
                  </div>
                )}
                
                <div className="overflow-y-auto flex-1">
                  {children}
                </div>
              </div>
            </div>
          </SheetContent>
        </SheetView>
      </SheetPortal>
    </SheetRoot>
  );
};
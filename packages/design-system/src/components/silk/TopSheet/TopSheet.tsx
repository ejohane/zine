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
import { X } from 'lucide-react';

export interface TopSheetProps {
  trigger?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
  height?: 'sm' | 'md' | 'lg' | 'auto';
  showHandle?: boolean;
  showCloseButton?: boolean;
  dismissible?: boolean;
  onClose?: () => void;
}

export const TopSheet: React.FC<TopSheetProps> = ({
  trigger,
  children,
  title,
  description,
  className,
  height = 'md',
  showHandle = true,
  showCloseButton = false,
  dismissible = true,
  onClose
}) => {
  const getHeightClasses = () => {
    switch (height) {
      case 'sm':
        return 'max-h-[30vh]';
      case 'md':
        return 'max-h-[50vh]';
      case 'lg':
        return 'max-h-[70vh]';
      case 'auto':
        return 'max-h-[90vh]';
      default:
        return 'max-h-[50vh]';
    }
  };

  return (
    <SheetRoot license="commercial">
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetPortal>
        <SheetView>
          <SheetBackdrop 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" 
            onClick={dismissible ? onClose : undefined}
          />
          <SheetContent 
            className={cn(
              "fixed top-0 left-0 right-0 z-50",
              "bg-white dark:bg-gray-900",
              "rounded-b-[20px]",
              "shadow-xl",
              "overflow-hidden",
              "animate-in slide-in-from-top duration-300",
              getHeightClasses(),
              className
            )}
          >
            <div className="h-full flex flex-col">
              {/* Header with handle and close button */}
              <div className="flex items-center justify-between p-4">
                <div className="flex-1">
                  {showHandle && (
                    <div className="flex justify-center">
                      <SheetHandle className="h-1 w-12 rounded-full bg-gray-300 dark:bg-gray-600" />
                    </div>
                  )}
                </div>
                
                {showCloseButton && (
                  <button
                    onClick={onClose}
                    className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              
              {/* Title and description */}
              {(title || description) && (
                <div className="px-4 pb-4">
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
              
              {/* Content */}
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                {children}
              </div>
            </div>
          </SheetContent>
        </SheetView>
      </SheetPortal>
    </SheetRoot>
  );
};
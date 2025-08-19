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

export type DetentPoint = 'small' | 'medium' | 'large' | 'full';

export interface SheetWithDetentProps {
  trigger?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
  detents?: DetentPoint[];
  initialDetent?: DetentPoint;
  onDetentChange?: (detent: DetentPoint) => void;
}

export const SheetWithDetent: React.FC<SheetWithDetentProps> = ({
  trigger,
  children,
  title,
  description,
  className,
  detents = ['medium', 'large', 'full'],
  initialDetent = 'medium',
  onDetentChange
}) => {
  const [currentDetent, setCurrentDetent] = React.useState<DetentPoint>(initialDetent);

  const handleDetentChange = (detent: DetentPoint) => {
    setCurrentDetent(detent);
    onDetentChange?.(detent);
  };

  const getDetentHeight = (detent: DetentPoint) => {
    switch (detent) {
      case 'small':
        return 'h-[30vh]';
      case 'medium':
        return 'h-[50vh]';
      case 'large':
        return 'h-[80vh]';
      case 'full':
        return 'h-[95vh]';
      default:
        return 'h-[50vh]';
    }
  };

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
              "overflow-hidden",
              "transition-all duration-300 ease-out",
              getDetentHeight(currentDetent),
              className
            )}
          >
            <div className="p-4 h-full flex flex-col">
              <div className="flex items-center justify-center mb-4">
                <SheetHandle className="h-1 w-12 rounded-full bg-gray-300 dark:bg-gray-600 cursor-grab active:cursor-grabbing" />
              </div>
              
              {/* Detent controls */}
              <div className="flex justify-center gap-2 mb-4">
                {detents.map((detent) => (
                  <button
                    key={detent}
                    onClick={() => handleDetentChange(detent)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                      currentDetent === detent
                        ? "bg-blue-500 text-white"
                        : "bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                    )}
                  >
                    {detent}
                  </button>
                ))}
              </div>
              
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
              
              <div className="flex-1 overflow-y-auto">
                {children}
              </div>
            </div>
          </SheetContent>
        </SheetView>
      </SheetPortal>
    </SheetRoot>
  );
};
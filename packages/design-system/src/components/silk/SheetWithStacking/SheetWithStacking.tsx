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

export interface StackedSheet {
  id: string;
  title?: string;
  description?: string;
  children: React.ReactNode;
  level: number;
}

export interface SheetWithStackingProps {
  trigger?: React.ReactNode;
  sheets: StackedSheet[];
  className?: string;
  maxStacks?: number;
  onStackChange?: (activeSheets: StackedSheet[]) => void;
}

export const SheetWithStacking: React.FC<SheetWithStackingProps> = ({
  trigger,
  sheets,
  className,
  maxStacks = 3,
  onStackChange
}) => {
  const [activeSheets, setActiveSheets] = React.useState<StackedSheet[]>([]);

  const addSheet = (sheet: StackedSheet) => {
    const newSheets = [...activeSheets, sheet].slice(-maxStacks);
    setActiveSheets(newSheets);
    onStackChange?.(newSheets);
  };

  const removeSheet = (sheetId: string) => {
    const newSheets = activeSheets.filter(sheet => sheet.id !== sheetId);
    setActiveSheets(newSheets);
    onStackChange?.(newSheets);
  };

  const getSheetOffset = (index: number) => {
    const offset = index * 20;
    const scale = 1 - (index * 0.05);
    return {
      transform: `translateY(${offset}px) scale(${scale})`,
      zIndex: 50 + (activeSheets.length - index)
    };
  };

  const getSheetOpacity = (index: number) => {
    return 1 - (index * 0.2);
  };

  React.useEffect(() => {
    if (sheets.length > 0 && activeSheets.length === 0) {
      setActiveSheets([sheets[0]]);
    }
  }, [sheets, activeSheets.length]);

  return (
    <SheetRoot license="commercial">
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetPortal>
        <SheetView>
          <SheetBackdrop className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" />
          
          {/* Render all active sheets */}
          {activeSheets.map((sheet, index) => (
            <SheetContent
              key={sheet.id}
              className={cn(
                "fixed bottom-0 left-0 right-0",
                "bg-white dark:bg-gray-900",
                "rounded-t-[20px]",
                "shadow-xl",
                "overflow-hidden",
                "max-h-[80vh]",
                "transition-all duration-300 ease-out",
                className
              )}
              style={{
                ...getSheetOffset(index),
                opacity: getSheetOpacity(index)
              }}
            >
              <div className="p-4 h-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <SheetHandle className="h-1 w-12 rounded-full bg-gray-300 dark:bg-gray-600" />
                    {activeSheets.length > 1 && (
                      <div className="flex gap-1">
                        {activeSheets.map((_, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              "w-2 h-2 rounded-full transition-colors",
                              idx === index
                                ? "bg-blue-500"
                                : "bg-gray-300 dark:bg-gray-600"
                            )}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* Stack controls */}
                  <div className="flex gap-2">
                    {index > 0 && (
                      <button
                        onClick={() => removeSheet(sheet.id)}
                        className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                      >
                        Back
                      </button>
                    )}
                    {index === 0 && activeSheets.length > 1 && (
                      <button
                        onClick={() => setActiveSheets([sheet])}
                        className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                      >
                        Clear Stack
                      </button>
                    )}
                  </div>
                </div>
                
                {(sheet.title || sheet.description) && (
                  <div className="mb-4">
                    {sheet.title && (
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {sheet.title}
                        {activeSheets.length > 1 && (
                          <span className="ml-2 text-sm text-gray-500">
                            ({index + 1}/{activeSheets.length})
                          </span>
                        )}
                      </h2>
                    )}
                    {sheet.description && (
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {sheet.description}
                      </p>
                    )}
                  </div>
                )}
                
                 <div className="flex-1 overflow-y-auto">
                   {React.cloneElement(sheet.children as React.ReactElement<any>, {
                     onOpenSheet: (newSheet: Omit<StackedSheet, 'level'>) => {
                       addSheet({
                         ...newSheet,
                         level: sheet.level + 1
                       });
                     }
                   })}
                 </div>
              </div>
            </SheetContent>
          ))}
        </SheetView>
      </SheetPortal>
    </SheetRoot>
  );
};
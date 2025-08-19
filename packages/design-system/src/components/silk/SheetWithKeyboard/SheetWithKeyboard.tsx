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

export interface SheetWithKeyboardProps {
  trigger?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
  adjustForKeyboard?: boolean;
  keyboardPadding?: number;
  autoFocus?: boolean;
  onKeyboardShow?: () => void;
  onKeyboardHide?: () => void;
}

export const SheetWithKeyboard: React.FC<SheetWithKeyboardProps> = ({
  trigger,
  children,
  title,
  description,
  className,
  adjustForKeyboard = true,
  keyboardPadding = 20,
  autoFocus = false,
  onKeyboardShow,
  onKeyboardHide
}) => {
  const [isKeyboardVisible, setIsKeyboardVisible] = React.useState(false);
  const [viewportHeight, setViewportHeight] = React.useState(0);
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      const currentHeight = window.visualViewport?.height || window.innerHeight;
      const fullHeight = window.screen.height;
      const heightDifference = fullHeight - currentHeight;
      
      // Keyboard is likely visible if viewport height decreased significantly
      const keyboardShowing = heightDifference > 150;
      
      if (keyboardShowing !== isKeyboardVisible) {
        setIsKeyboardVisible(keyboardShowing);
        if (keyboardShowing) {
          onKeyboardShow?.();
        } else {
          onKeyboardHide?.();
        }
      }
      
      setViewportHeight(currentHeight);
    };

    // Initial setup
    handleResize();

    // Listen for viewport changes (includes keyboard)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      return () => window.visualViewport?.removeEventListener('resize', handleResize);
    } else {
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [isKeyboardVisible, onKeyboardShow, onKeyboardHide]);

  // Auto-focus first input when sheet opens
  React.useEffect(() => {
    if (autoFocus && contentRef.current) {
      const firstInput = contentRef.current.querySelector('input, textarea, select') as HTMLElement;
      if (firstInput) {
        // Delay focus to ensure sheet animation completes
        setTimeout(() => firstInput.focus(), 300);
      }
    }
  }, [autoFocus]);

  const getSheetHeight = () => {
    if (!adjustForKeyboard || !isKeyboardVisible) {
      return undefined;
    }
    
    // When keyboard is visible, adjust height based on viewport
    const availableHeight = viewportHeight - keyboardPadding;
    return { maxHeight: `${availableHeight}px` };
  };

  return (
    <SheetRoot license="commercial">
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetPortal>
        <SheetView>
          <SheetBackdrop className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <SheetContent 
            ref={contentRef}
            className={cn(
              "fixed bottom-0 left-0 right-0 z-50",
              "bg-white dark:bg-gray-900",
              "rounded-t-[20px]",
              "shadow-xl",
              "overflow-hidden",
              "transition-all duration-300 ease-out",
              !adjustForKeyboard && "max-h-[90vh]",
              className
            )}
            style={adjustForKeyboard ? getSheetHeight() : undefined}
          >
            <div className="p-4 h-full flex flex-col">
              <div className="flex items-center justify-center mb-4">
                <SheetHandle className="h-1 w-12 rounded-full bg-gray-300 dark:bg-gray-600" />
              </div>
              
              {/* Keyboard indicator */}
              {isKeyboardVisible && (
                <div className="mb-2 px-2 py-1 bg-blue-100 dark:bg-blue-900/20 rounded-lg text-xs text-blue-600 dark:text-blue-400 text-center">
                  Keyboard active - Optimized layout
                </div>
              )}
              
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
              
              <div className={cn(
                "flex-1 overflow-y-auto",
                isKeyboardVisible && "pb-2" // Less padding when keyboard is visible
              )}>
                {children}
              </div>
              
              {/* Safe area for keyboard */}
              {isKeyboardVisible && adjustForKeyboard && (
                <div style={{ height: `${keyboardPadding}px` }} className="flex-shrink-0" />
              )}
            </div>
          </SheetContent>
        </SheetView>
      </SheetPortal>
    </SheetRoot>
  );
};
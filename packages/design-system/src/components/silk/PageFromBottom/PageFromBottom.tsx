import * as React from 'react';
import { cn } from '../../../lib/utils';
import { ChevronLeft, X } from 'lucide-react';

export interface PageFromBottomProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  onClose?: () => void;
  headerAction?: React.ReactNode;
  className?: string;
  isOpen: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const PageFromBottom: React.FC<PageFromBottomProps> = ({
  children,
  title,
  subtitle,
  onBack,
  onClose,
  headerAction,
  className,
  isOpen,
  onOpenChange
}) => {
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleClose = () => {
    onClose?.();
    onOpenChange?.(false);
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 transition-transform duration-300 ease-out",
        isOpen ? "translate-y-0" : "translate-y-full",
        className
      )}
    >
      <div className="h-full bg-white dark:bg-gray-900 flex flex-col">
        <header className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              {onBack && (
                <button
                  onClick={onBack}
                  className="p-2 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  aria-label="Go back"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              <div>
                {title && (
                  <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {headerAction}
              <button
                onClick={handleClose}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>
        
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
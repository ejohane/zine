import * as React from 'react';
import { cn } from '../../../lib/utils';
import { ChevronLeft, X } from 'lucide-react';

export interface PageProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  onClose?: () => void;
  headerAction?: React.ReactNode;
  className?: string;
  variant?: 'default' | 'fullscreen' | 'modal';
  showHeader?: boolean;
}

export const Page: React.FC<PageProps> = ({
  children,
  title,
  subtitle,
  onBack,
  onClose,
  headerAction,
  className,
  variant = 'default',
  showHeader = true
}) => {
  const variantClasses = {
    default: 'min-h-screen bg-gray-50 dark:bg-gray-950',
    fullscreen: 'fixed inset-0 bg-white dark:bg-gray-900 z-50',
    modal: 'fixed inset-0 bg-white dark:bg-gray-900 z-50 animate-slide-in-right',
  };

  return (
    <div className={cn(variantClasses[variant], className)}>
      {showHeader && (title || onBack || onClose) && (
        <header className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
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
              {onClose && (
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </header>
      )}
      <main className={cn(
        "flex-1",
        showHeader && "pt-0",
        !showHeader && variant === 'default' && "pt-16"
      )}>
        {children}
      </main>
    </div>
  );
};
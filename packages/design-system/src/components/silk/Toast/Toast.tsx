import * as React from 'react';
import { cn } from '../../../lib/utils';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info';
export type ToastPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface ToastProps {
  id?: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
  persistent?: boolean;
  showCloseButton?: boolean;
  className?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  onClose?: () => void;
}

export interface ToastProviderProps {
  children: React.ReactNode;
  position?: ToastPosition;
  maxToasts?: number;
}

interface ToastContextType {
  toasts: (ToastProps & { id: string })[];
  addToast: (toast: Omit<ToastProps, 'id'>) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

const ToastContext = React.createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<ToastProviderProps> = ({
  children,
  position = 'top-right',
  maxToasts = 5
}) => {
  const [toasts, setToasts] = React.useState<(ToastProps & { id: string })[]>([]);

  const addToast = React.useCallback((toast: Omit<ToastProps, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast = { ...toast, id };
    
    setToasts(current => {
      const updated = [newToast, ...current].slice(0, maxToasts);
      return updated;
    });

    // Auto remove toast if not persistent
    if (!toast.persistent) {
      const duration = toast.duration || 5000;
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  }, [maxToasts]);

  const removeToast = React.useCallback((id: string) => {
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const clearToasts = React.useCallback(() => {
    setToasts([]);
  }, []);

  const getPositionClasses = () => {
    switch (position) {
      case 'top-left':
        return 'top-4 left-4';
      case 'top-center':
        return 'top-4 left-1/2 -translate-x-1/2';
      case 'top-right':
        return 'top-4 right-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      case 'bottom-center':
        return 'bottom-4 left-1/2 -translate-x-1/2';
      case 'bottom-right':
        return 'bottom-4 right-4';
      default:
        return 'top-4 right-4';
    }
  };

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, clearToasts }}>
      {children}
      
      {/* Toast Container */}
      <div className={cn(
        "fixed z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]",
        getPositionClasses()
      )}>
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            {...toast}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const Toast: React.FC<ToastProps> = ({
  title,
  description,
  variant = 'default',
  showCloseButton = true,
  className,
  action,
  onClose
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'success':
        return {
          container: 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800',
          icon: CheckCircle,
          iconColor: 'text-green-600 dark:text-green-400',
          title: 'text-green-900 dark:text-green-100',
          description: 'text-green-700 dark:text-green-300',
        };
      case 'error':
        return {
          container: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
          icon: AlertCircle,
          iconColor: 'text-red-600 dark:text-red-400',
          title: 'text-red-900 dark:text-red-100',
          description: 'text-red-700 dark:text-red-300',
        };
      case 'warning':
        return {
          container: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800',
          icon: AlertTriangle,
          iconColor: 'text-yellow-600 dark:text-yellow-400',
          title: 'text-yellow-900 dark:text-yellow-100',
          description: 'text-yellow-700 dark:text-yellow-300',
        };
      case 'info':
        return {
          container: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
          icon: Info,
          iconColor: 'text-blue-600 dark:text-blue-400',
          title: 'text-blue-900 dark:text-blue-100',
          description: 'text-blue-700 dark:text-blue-300',
        };
      default:
        return {
          container: 'bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700',
          icon: Info,
          iconColor: 'text-gray-600 dark:text-gray-400',
          title: 'text-gray-900 dark:text-gray-100',
          description: 'text-gray-700 dark:text-gray-300',
        };
    }
  };

  const styles = getVariantStyles();
  const IconComponent = styles.icon;

  return (
    <div
      className={cn(
        "relative p-4 rounded-lg border shadow-lg backdrop-blur-sm",
        "animate-in slide-in-from-top-2 duration-300",
        styles.container,
        className
      )}
    >
      <div className="flex gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 pt-0.5">
          <IconComponent className={cn("h-5 w-5", styles.iconColor)} />
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          {title && (
            <div className={cn("font-medium text-sm mb-1", styles.title)}>
              {title}
            </div>
          )}
          {description && (
            <div className={cn("text-sm", styles.description)}>
              {description}
            </div>
          )}
          
          {/* Action */}
          {action && (
            <button
              onClick={action.onClick}
              className={cn(
                "mt-2 text-sm font-medium underline hover:no-underline",
                styles.title
              )}
            >
              {action.label}
            </button>
          )}
        </div>
        
        {/* Close Button */}
        {showCloseButton && (
          <button
            onClick={onClose}
            className={cn(
              "flex-shrink-0 p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors",
              styles.iconColor
            )}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};
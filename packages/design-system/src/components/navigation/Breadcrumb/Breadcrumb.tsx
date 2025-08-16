import * as React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
}

export interface BreadcrumbProps extends React.HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[];
  separator?: React.ReactNode;
  showHome?: boolean;
  homeLabel?: string;
  onHomeClick?: () => void;
  maxItems?: number;
}

const Breadcrumb = React.forwardRef<HTMLElement, BreadcrumbProps>(
  (
    {
      className,
      items,
      separator = <ChevronRight className="h-4 w-4" />,
      showHome = true,
      homeLabel = 'Home',
      onHomeClick,
      maxItems,
      ...props
    },
    ref
  ) => {
    const displayItems = React.useMemo(() => {
      if (!maxItems || items.length <= maxItems) {
        return items;
      }

      // Show first item, ellipsis, and last (maxItems - 2) items
      const firstItem = items[0];
      const lastItems = items.slice(-(maxItems - 2));
      
      return [
        firstItem,
        { label: '...', onClick: undefined },
        ...lastItems,
      ];
    }, [items, maxItems]);

    return (
      <nav
        ref={ref}
        aria-label="Breadcrumb"
        className={cn('flex items-center space-x-1 text-sm', className)}
        {...props}
      >
        {showHome && (
          <>
            <button
              onClick={onHomeClick}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Home className="h-4 w-4" />
              <span>{homeLabel}</span>
            </button>
            {items.length > 0 && (
              <span className="text-muted-foreground">{separator}</span>
            )}
          </>
        )}
        
        {displayItems.map((item, index) => {
          const isLast = index === displayItems.length - 1;
          const isEllipsis = item.label === '...';
          
          return (
            <React.Fragment key={index}>
              {isLast ? (
                <span className="flex items-center gap-1 font-medium text-foreground">
                  {item.icon}
                  {item.label}
                </span>
              ) : isEllipsis ? (
                <span className="text-muted-foreground px-1">...</span>
              ) : (
                <button
                  onClick={item.onClick}
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {item.icon}
                  {item.label}
                </button>
              )}
              {!isLast && !isEllipsis && (
                <span className="text-muted-foreground">{separator}</span>
              )}
            </React.Fragment>
          );
        })}
      </nav>
    );
  }
);

Breadcrumb.displayName = 'Breadcrumb';

export { Breadcrumb };
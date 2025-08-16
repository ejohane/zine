import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../ui/button';

const sidebarVariants = cva(
  'flex flex-col h-full bg-card border-r transition-all duration-300',
  {
    variants: {
      variant: {
        default: '',
        floating: 'absolute top-0 left-0 z-40 shadow-lg',
        overlay: 'fixed top-0 left-0 z-50 shadow-xl',
      },
      collapsed: {
        true: 'w-16',
        false: 'w-64',
      },
    },
    defaultVariants: {
      variant: 'default',
      collapsed: false,
    },
  }
);

interface SidebarItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  badge?: string | number;
  children?: SidebarItem[];
}

export interface SidebarProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof sidebarVariants> {
  items?: SidebarItem[];
  header?: React.ReactNode;
  footer?: React.ReactNode;
  collapsible?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

const SidebarItemComponent: React.FC<{
  item: SidebarItem;
  collapsed?: boolean;
  level?: number;
}> = ({ item, collapsed = false, level = 0 }) => {
  const [expanded, setExpanded] = React.useState(false);
  const hasChildren = item.children && item.children.length > 0;

  return (
    <div>
      <button
        onClick={() => {
          if (hasChildren) {
            setExpanded(!expanded);
          }
          item.onClick?.();
        }}
        className={cn(
          'flex items-center w-full px-3 py-2 text-sm rounded-md transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          item.active && 'bg-accent text-accent-foreground',
          level > 0 && 'ml-6'
        )}
      >
        {item.icon && (
          <span className={cn('flex-shrink-0', collapsed ? '' : 'mr-3')}>
            {item.icon}
          </span>
        )}
        {!collapsed && (
          <>
            <span className="flex-1 text-left">{item.label}</span>
            {item.badge && (
              <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-xs text-primary-foreground">
                {item.badge}
              </span>
            )}
            {hasChildren && (
              <ChevronRight
                className={cn(
                  'ml-2 h-4 w-4 transition-transform',
                  expanded && 'rotate-90'
                )}
              />
            )}
          </>
        )}
      </button>
      {!collapsed && expanded && hasChildren && (
        <div className="mt-1">
          {item.children!.map((child) => (
            <SidebarItemComponent
              key={child.id}
              item={child}
              collapsed={collapsed}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const Sidebar = React.forwardRef<HTMLElement, SidebarProps>(
  (
    {
      className,
      variant,
      collapsed: controlledCollapsed,
      collapsible = false,
      onCollapsedChange,
      items = [],
      header,
      footer,
      ...props
    },
    ref
  ) => {
    const [internalCollapsed, setInternalCollapsed] = React.useState(false);
    const collapsed = controlledCollapsed ?? internalCollapsed;

    const handleCollapsedChange = (newCollapsed: boolean) => {
      setInternalCollapsed(newCollapsed);
      onCollapsedChange?.(newCollapsed);
    };

    return (
      <>
        {variant === 'overlay' && !collapsed && (
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => handleCollapsedChange(true)}
          />
        )}
        <aside
          ref={ref}
          className={cn(sidebarVariants({ variant, collapsed }), className)}
          {...props}
        >
          {/* Header */}
          {header && (
            <div className={cn('p-4 border-b', collapsed && 'px-2')}>
              {header}
            </div>
          )}

          {/* Collapse Toggle */}
          {collapsible && (
            <div className={cn('p-2', collapsed ? 'px-1' : 'px-3')}>
              <Button
                variant="ghost"
                size="icon"
                className="w-full"
                onClick={() => handleCollapsedChange(!collapsed)}
              >
                {collapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}

          {/* Navigation Items */}
          <nav className="flex-1 overflow-y-auto p-3">
            {items.map((item) => (
              <SidebarItemComponent
                key={item.id}
                item={item}
                collapsed={collapsed}
              />
            ))}
          </nav>

          {/* Footer */}
          {footer && (
            <div className={cn('p-4 border-t', collapsed && 'px-2')}>
              {footer}
            </div>
          )}
        </aside>
      </>
    );
  }
);

Sidebar.displayName = 'Sidebar';

export { Sidebar, sidebarVariants };
export type { SidebarItem };
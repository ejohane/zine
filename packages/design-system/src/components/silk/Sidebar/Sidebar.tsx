import * as React from 'react';
import { cn } from '../../../lib/utils';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export interface SidebarItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  href?: string;
  onClick?: () => void;
  badge?: string | number;
  active?: boolean;
  children?: SidebarItem[];
}

export interface SidebarProps {
  items: SidebarItem[];
  className?: string;
  position?: 'left' | 'right';
  width?: 'sm' | 'md' | 'lg' | 'xl';
  collapsible?: boolean;
  collapsed?: boolean;
  onCollapseChange?: (collapsed: boolean) => void;
  showCloseButton?: boolean;
  onClose?: () => void;
  overlay?: boolean;
  title?: string;
  subtitle?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  items,
  className,
  position = 'left',
  width = 'md',
  collapsible = false,
  collapsed: controlledCollapsed,
  onCollapseChange,
  showCloseButton = false,
  onClose,
  overlay = false,
  title,
  subtitle
}) => {
  const [internalCollapsed, setInternalCollapsed] = React.useState(false);
  const collapsed = controlledCollapsed ?? internalCollapsed;

  const handleCollapseToggle = () => {
    const newCollapsed = !collapsed;
    if (onCollapseChange) {
      onCollapseChange(newCollapsed);
    } else {
      setInternalCollapsed(newCollapsed);
    }
  };

  const widthClasses = {
    sm: collapsed ? 'w-16' : 'w-48',
    md: collapsed ? 'w-16' : 'w-64',
    lg: collapsed ? 'w-16' : 'w-72',
    xl: collapsed ? 'w-16' : 'w-80',
  };

  const positionClasses = {
    left: 'left-0',
    right: 'right-0',
  };

  const renderSidebarItem = (item: SidebarItem, depth = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const [expanded, setExpanded] = React.useState(false);

    const handleItemClick = () => {
      if (hasChildren && !collapsed) {
        setExpanded(!expanded);
      } else if (item.onClick) {
        item.onClick();
      }
    };

    return (
      <div key={item.id}>
        <button
          onClick={handleItemClick}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group",
            item.active
              ? "bg-blue-500 text-white"
              : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800",
            collapsed && "justify-center px-2",
            depth > 0 && !collapsed && "ml-4"
          )}
          title={collapsed ? item.label : undefined}
        >
          {item.icon && (
            <item.icon 
              className={cn(
                "h-5 w-5 flex-shrink-0",
                item.active ? "text-white" : "text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-200"
              )} 
            />
          )}
          
          {!collapsed && (
            <>
              <span className="flex-1 text-left font-medium">{item.label}</span>
              
              {item.badge && (
                <span className={cn(
                  "px-2 py-1 text-xs rounded-full",
                  item.active 
                    ? "bg-white/20 text-white" 
                    : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                )}>
                  {item.badge}
                </span>
              )}
              
              {hasChildren && (
                <ChevronRight 
                  className={cn(
                    "h-4 w-4 transition-transform",
                    expanded && "rotate-90"
                  )} 
                />
              )}
            </>
          )}
        </button>
        
        {/* Render children */}
        {hasChildren && expanded && !collapsed && (
          <div className="mt-1 space-y-1">
            {item.children!.map(child => renderSidebarItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Overlay */}
      {overlay && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />
      )}
      
      {/* Sidebar */}
      <div
        className={cn(
          "fixed top-0 bottom-0 z-50",
          "bg-white dark:bg-gray-900",
          "border-r border-gray-200 dark:border-gray-800",
          "transition-all duration-300 ease-out",
          "flex flex-col",
          widthClasses[width],
          positionClasses[position],
          className
        )}
      >
        {/* Header */}
        <div className={cn(
          "flex items-center p-4 border-b border-gray-200 dark:border-gray-800",
          collapsed && "justify-center px-2"
        )}>
          {!collapsed && (title || subtitle) && (
            <div className="flex-1">
              {title && (
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {subtitle}
                </p>
              )}
            </div>
          )}
          
          <div className="flex items-center gap-1">
            {collapsible && (
              <button
                onClick={handleCollapseToggle}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {position === 'left' ? (
                  collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />
                ) : (
                  collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                )}
              </button>
            )}
            
            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Close sidebar"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {items.map(item => renderSidebarItem(item))}
        </nav>
        
        {/* Footer */}
        {!collapsed && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-800">
            <div className="text-xs text-gray-500 text-center">
              v1.0.0
            </div>
          </div>
        )}
      </div>
    </>
  );
};
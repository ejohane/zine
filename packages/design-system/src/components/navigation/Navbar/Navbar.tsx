import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Button } from '../../ui/button';
import { Menu, X } from 'lucide-react';

const navbarVariants = cva(
  'w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
  {
    variants: {
      sticky: {
        true: 'sticky top-0 z-50',
        false: 'relative',
      },
    },
    defaultVariants: {
      sticky: true,
    },
  }
);

export interface NavbarProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof navbarVariants> {
  logo?: React.ReactNode;
  items?: Array<{
    label: string;
    href?: string;
    onClick?: () => void;
    active?: boolean;
  }>;
  actions?: React.ReactNode;
  mobileBreakpoint?: 'sm' | 'md' | 'lg';
}

const Navbar = React.forwardRef<HTMLElement, NavbarProps>(
  (
    {
      className,
      sticky,
      logo,
      items = [],
      actions,
      mobileBreakpoint = 'md',
      ...props
    },
    ref
  ) => {
    const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

    const mobileClass = {
      sm: 'sm:hidden',
      md: 'md:hidden',
      lg: 'lg:hidden',
    }[mobileBreakpoint];

    const desktopClass = {
      sm: 'hidden sm:flex',
      md: 'hidden md:flex',
      lg: 'hidden lg:flex',
    }[mobileBreakpoint];

    return (
      <nav ref={ref} className={cn(navbarVariants({ sticky }), className)} {...props}>
        <div className="container flex h-16 items-center">
          {/* Logo */}
          {logo && <div className="mr-6 flex items-center">{logo}</div>}

          {/* Desktop Navigation */}
          <div className={cn(desktopClass, 'flex-1 items-center gap-6')}>
            {items.map((item, index) => (
              <button
                key={index}
                onClick={item.onClick}
                className={cn(
                  'text-sm font-medium transition-colors hover:text-primary',
                  item.active ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Desktop Actions */}
          <div className={cn(desktopClass, 'items-center gap-4')}>
            {actions}
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(mobileClass, 'ml-auto')}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className={cn(mobileClass, 'border-t')}>
            <div className="container py-4">
              <div className="flex flex-col gap-4">
                {items.map((item, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      item.onClick?.();
                      setMobileMenuOpen(false);
                    }}
                    className={cn(
                      'text-left text-sm font-medium transition-colors hover:text-primary',
                      item.active ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {item.label}
                  </button>
                ))}
                {actions && (
                  <div className="flex flex-col gap-2 pt-4 border-t">
                    {actions}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </nav>
    );
  }
);

Navbar.displayName = 'Navbar';

export { Navbar, navbarVariants };
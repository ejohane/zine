import { Link, NavLink } from 'react-router-dom';
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from 'react';

import {
  Colors,
  Radius,
  getSurfaceBackgroundColor,
  getSurfaceBorderColor,
  type BadgeTone,
  type ButtonTone,
  type ButtonVariant,
  type SurfaceBorder,
  type SurfaceTone,
} from '@zine/design-system';

import { Badge as PrimitiveBadge } from '@/components/ui/badge';
import { Button as PrimitiveButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export { cn };

export function Button({
  tone = 'default',
  variant,
  children,
  className,
  ...props
}: Omit<ComponentPropsWithoutRef<typeof PrimitiveButton>, 'tone'> & {
  tone?: ButtonTone | 'ghost';
  variant?: ButtonVariant | 'default';
}) {
  const resolvedVariant = variant ?? (tone === 'ghost' ? 'ghost' : undefined);
  const buttonTone = tone === 'danger' ? 'danger' : 'default';

  return (
    <PrimitiveButton className={className} tone={buttonTone} variant={resolvedVariant} {...props}>
      {children}
    </PrimitiveButton>
  );
}

export function AnchorButton({
  tone = 'default',
  variant,
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<'a'> & {
  tone?: ButtonTone | 'ghost';
  variant?: ButtonVariant | 'default';
}) {
  const resolvedVariant = variant ?? (tone === 'ghost' ? 'ghost' : undefined);
  const buttonTone = tone === 'danger' ? 'danger' : 'default';

  return (
    <PrimitiveButton asChild className={className} tone={buttonTone} variant={resolvedVariant}>
      <a {...props}>{children}</a>
    </PrimitiveButton>
  );
}

export function LinkButton({
  tone = 'default',
  variant,
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Link> & {
  tone?: ButtonTone | 'ghost';
  variant?: ButtonVariant | 'default';
}) {
  const resolvedVariant = variant ?? (tone === 'ghost' ? 'ghost' : undefined);
  const buttonTone = tone === 'danger' ? 'danger' : 'default';

  return (
    <PrimitiveButton asChild className={className} tone={buttonTone} variant={resolvedVariant}>
      <Link {...props}>{children}</Link>
    </PrimitiveButton>
  );
}

export function Surface({
  className,
  children,
  tone = 'elevated',
  border = 'default',
  radius = 'lg',
  style,
}: {
  className?: string;
  children: ReactNode;
  tone?: SurfaceTone;
  border?: SurfaceBorder;
  radius?: keyof typeof Radius;
  style?: CSSProperties;
}) {
  const borderColor = getSurfaceBorderColor(Colors.dark, tone, border);

  return (
    <section
      className={cn(
        'text-card-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.03),var(--shadow)]',
        className
      )}
      style={{
        borderRadius: Radius[radius],
        backgroundColor: getSurfaceBackgroundColor(Colors.dark, tone),
        borderColor: borderColor ?? 'transparent',
        borderWidth: borderColor ? 1 : 0,
        ...style,
      }}
    >
      {children}
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-header__description">{description}</p>
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Surface className="stat-card">
      <p className="eyebrow">{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </Surface>
  );
}

export function Badge({
  tone = 'subtle',
  className,
  children,
  ...props
}: {
  tone?: BadgeTone | 'default' | 'danger';
  className?: string;
  children: ReactNode;
}) {
  const resolvedTone = tone === 'default' ? 'subtle' : tone === 'danger' ? 'error' : tone;

  return (
    <PrimitiveBadge className={className} tone={resolvedTone} {...props}>
      {children}
    </PrimitiveBadge>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <Surface className="empty-state">
      <p className="eyebrow">Empty for now</p>
      <h2>{title}</h2>
      <p>{message}</p>
      {action}
    </Surface>
  );
}

export function QueryBoundary({
  isLoading,
  error,
  isEmpty,
  empty,
  children,
}: {
  isLoading: boolean;
  error?: { message?: string } | null;
  isEmpty?: boolean;
  empty?: ReactNode;
  children: ReactNode;
}) {
  if (isLoading) {
    return (
      <Surface className="empty-state">
        <p className="eyebrow">Loading</p>
        <h2>Pulling in your latest state.</h2>
      </Surface>
    );
  }

  if (error) {
    return (
      <Surface className="empty-state">
        <p className="eyebrow">Something broke</p>
        <h2>Could not load this section.</h2>
        <p>{error.message ?? 'Please refresh and try again.'}</p>
      </Surface>
    );
  }

  if (isEmpty) {
    return <>{empty}</>;
  }

  return <>{children}</>;
}

export function SidebarLink({ to, label, short }: { to: string; label: string; short: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => cn('sidebar-link', isActive && 'sidebar-link--active')}
    >
      <span className="sidebar-link__short">{short}</span>
      <span>{label}</span>
    </NavLink>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {hint ? <span className="field__hint">{hint}</span> : null}
      {children}
    </label>
  );
}

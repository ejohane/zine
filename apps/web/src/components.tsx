import { Link } from 'react-router-dom';
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

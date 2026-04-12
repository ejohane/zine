import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';

import { Colors, IconSizes, Motion, Radius, Spacing, Typography } from '@zine/design-system';

import { createDarkCanvasDecorator } from './decorators';

function TokenSwatch({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-3">
        <span
          className="block size-8 rounded-full border border-border"
          style={{ backgroundColor: value }}
        />
        <div>
          <div className="text-sm font-medium text-foreground">{label}</div>
          <div className="text-xs text-[var(--text-subheader)]">{value}</div>
        </div>
      </div>
    </div>
  );
}

function TokenMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-[20px] border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{label}</div>
      <div className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-foreground">{value}</div>
      {detail ? <div className="mt-2 text-sm text-[var(--text-subheader)]">{detail}</div> : null}
    </div>
  );
}

function FoundationsTokensReference() {
  return (
    <div className="grid gap-8">
      <section className="grid gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
            Foundations
          </p>
          <h1 className="mt-2 text-5xl font-semibold tracking-[-0.06em] text-foreground">
            Color Roles
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--text-subheader)]">
            The web channel reads from the same dark-first token system as mobile. These semantic
            roles are the contract for the rest of the shared component work.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <TokenSwatch label="Surface / Canvas" value={Colors.dark.surfaceCanvas} />
          <TokenSwatch label="Surface / Elevated" value={Colors.dark.surfaceElevated} />
          <TokenSwatch label="Surface / Raised" value={Colors.dark.surfaceRaised} />
          <TokenSwatch label="Text / Primary" value={Colors.dark.textPrimary} />
          <TokenSwatch label="Text / Subheader" value={Colors.dark.textSubheader} />
          <TokenSwatch label="Accent" value={Colors.dark.accent} />
          <TokenSwatch label="Status / Success" value={Colors.dark.statusSuccess} />
          <TokenSwatch label="Status / Warning" value={Colors.dark.statusWarning} />
          <TokenSwatch label="Status / Error" value={Colors.dark.statusError} />
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">
          Typography Scale
        </h2>
        <div className="rounded-[24px] border border-border bg-card p-6">
          <div style={Typography.displayMedium as CSSProperties}>Display Medium</div>
          <div className="mt-4" style={Typography.headlineLarge as CSSProperties}>
            Headline Large
          </div>
          <div className="mt-4" style={Typography.titleLarge as CSSProperties}>
            Title Large
          </div>
          <div className="mt-4" style={Typography.bodyMedium as CSSProperties}>
            Body Medium keeps the dense editorial rhythm from mobile.
          </div>
          <div className="mt-4" style={Typography.labelSmall as CSSProperties}>
            Label Small
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <TokenMetric label="Spacing" value={`${Spacing.lg}px`} detail="Base layout rhythm" />
        <TokenMetric
          label="Radius"
          value={`${Radius.lg}px`}
          detail="Default shared corner radius"
        />
        <TokenMetric
          label="Motion"
          value={`${Motion.duration.normal}ms`}
          detail="Standard transition window"
        />
        <TokenMetric label="Icon" value={`${IconSizes.md}px`} detail="Default medium icon size" />
      </section>
    </div>
  );
}

const meta = {
  title: 'Foundations/Tokens/Reference',
  component: FoundationsTokensReference,
  decorators: [createDarkCanvasDecorator({ minHeight: 920 })],
} satisfies Meta<typeof FoundationsTokensReference>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Reference: Story = {};

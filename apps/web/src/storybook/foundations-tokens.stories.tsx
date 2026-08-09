import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  BrandColors,
  CoolReadingScale,
  IconSizes,
  Motion,
  OrangeScale,
  Radius,
  SemanticColorRoles,
  Spacing,
  StatusColors,
  Typography,
} from '@zine/design-system';

import { typographyStyle } from '@/lib/utils';

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
      <div className="text-xs uppercase tracking-[0.18em] text-[var(--text-subheader)]">
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-foreground">{value}</div>
      {detail ? <div className="mt-2 text-sm text-[var(--text-subheader)]">{detail}</div> : null}
    </div>
  );
}

function PaletteScale({ label, colors }: { label: string; colors: Record<string, string> }) {
  return (
    <section className="grid gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-subheader)]">
        {label}
      </h2>
      <div className="grid overflow-hidden rounded-[20px] border border-border md:grid-cols-6">
        {Object.entries(colors).map(([step, value]) => (
          <div
            key={step}
            className="flex min-h-24 flex-col justify-end p-3"
            style={{
              backgroundColor: value,
              color:
                step === '700' || step === '800' || step === '950'
                  ? SemanticColorRoles.dark.primaryText
                  : SemanticColorRoles.light.primaryText,
            }}
          >
            <strong className="text-xs">{step}</strong>
            <span className="mt-1 text-[0.68rem]">{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function FoundationsTokensReference() {
  return (
    <div className="grid gap-8">
      <section className="grid gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--inline-link)]">
            Zine foundation
          </p>
          <h1 className="mt-2 text-5xl font-semibold tracking-[-0.06em] text-foreground">
            One voice, two platforms.
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--text-subheader)]">
            Brand anchors, reading scales, and semantic roles are shared foundations. The web app
            uses the light roles while dark surfaces use the same orange accent and cool neutrals.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <TokenSwatch label="Zine Black" value={BrandColors.black} />
          <TokenSwatch label="Zine Orange" value={BrandColors.orange} />
        </div>
      </section>

      <PaletteScale label="Orange scale" colors={OrangeScale} />
      <PaletteScale label="Cool reading scale" colors={CoolReadingScale} />

      <section className="grid gap-4">
        <h2 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">
          Cross-platform semantic roles
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <TokenSwatch label="Light / Canvas" value={SemanticColorRoles.light.canvas} />
          <TokenSwatch label="Light / Surface" value={SemanticColorRoles.light.surface} />
          <TokenSwatch label="Light / Raised" value={SemanticColorRoles.light.raised} />
          <TokenSwatch label="Light / Primary text" value={SemanticColorRoles.light.primaryText} />
          <TokenSwatch
            label="Light / Secondary text"
            value={SemanticColorRoles.light.secondaryText}
          />
          <TokenSwatch label="Light / Border" value={SemanticColorRoles.light.border} />
          <TokenSwatch label="Dark / Canvas" value={SemanticColorRoles.dark.canvas} />
          <TokenSwatch label="Dark / Surface" value={SemanticColorRoles.dark.surface} />
          <TokenSwatch label="Dark / Raised" value={SemanticColorRoles.dark.raised} />
          <TokenSwatch label="Dark / Primary text" value={SemanticColorRoles.dark.primaryText} />
          <TokenSwatch
            label="Dark / Secondary text"
            value={SemanticColorRoles.dark.secondaryText}
          />
          <TokenSwatch label="Dark / Border" value={SemanticColorRoles.dark.border} />
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">Status roles</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <TokenSwatch label="Success" value={StatusColors.success.accent} />
          <TokenSwatch label="Warning" value={StatusColors.warning.accent} />
          <TokenSwatch label="Danger" value={StatusColors.danger.accent} />
          <TokenSwatch label="Information" value={StatusColors.information.accent} />
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">
          Typography Scale
        </h2>
        <div className="rounded-[24px] border border-border bg-card p-6">
          <div style={typographyStyle(Typography.displayMedium)}>Display Medium</div>
          <div className="mt-4" style={typographyStyle(Typography.headlineLarge)}>
            Headline Large
          </div>
          <div className="mt-4" style={typographyStyle(Typography.titleLarge)}>
            Title Large
          </div>
          <div className="mt-4" style={typographyStyle(Typography.bodyMedium)}>
            Body Medium keeps the dense editorial rhythm from mobile.
          </div>
          <div className="mt-4" style={typographyStyle(Typography.labelSmall)}>
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

import type { Meta, StoryObj } from '@storybook/react-vite';

import { createDarkCanvasDecorator } from './decorators';

function FoundationsPrinciplesReference() {
  const principles = [
    'Content leads. Decorative treatment should never outrank title, creator, status, or primary action.',
    'Hierarchy comes from contrast, spacing, and typography, not stacked embellishment.',
    'Dark-first surfaces should feel layered rather than flat.',
    'Monochrome is the default; metadata colors should stay restrained.',
    'Motion should clarify state changes, not add activity.',
  ];

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Principles</p>
        <h1 className="mt-2 text-5xl font-semibold tracking-[-0.06em] text-foreground">
          North Star
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--text-subheader)]">
          The browser channel should feel like the same editorial product as mobile: dense enough
          for serious reading, calm under dark surfaces, and deliberate about every accent.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {principles.map((principle) => (
          <div key={principle} className="rounded-[24px] border border-border bg-card p-6">
            <p className="text-base leading-7 text-[var(--text-subheader)]">{principle}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const meta = {
  title: 'Foundations/Principles/North Star',
  component: FoundationsPrinciplesReference,
  decorators: [createDarkCanvasDecorator({ minHeight: 760 })],
} satisfies Meta<typeof FoundationsPrinciplesReference>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Reference: Story = {};

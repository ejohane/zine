import type { Meta, StoryObj } from '@storybook/react-vite';

import { Badge } from '@/components';

import { createDarkCanvasDecorator } from './decorators';

function BadgeGallery() {
  return (
    <div className="rounded-[24px] border border-border bg-card p-6">
      <div className="flex flex-wrap gap-3">
        <Badge tone="subtle">Subtle</Badge>
        <Badge tone="neutral">Neutral</Badge>
        <Badge tone="accent">Accent</Badge>
        <Badge tone="success">Success</Badge>
        <Badge tone="warning">Warning</Badge>
        <Badge tone="error">Error</Badge>
      </div>
    </div>
  );
}

const meta = {
  title: 'Primitives/Badge/Tones',
  component: BadgeGallery,
  decorators: [createDarkCanvasDecorator()],
} satisfies Meta<typeof BadgeGallery>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Tones: Story = {};

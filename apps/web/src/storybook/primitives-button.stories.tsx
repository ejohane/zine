import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '@/components';

import { createDarkCanvasDecorator } from './decorators';

function ButtonGallery() {
  return (
    <div className="rounded-[24px] border border-border bg-card p-6">
      <div className="flex flex-wrap gap-3">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button tone="danger">Danger</Button>
        <Button disabled>Disabled</Button>
      </div>
    </div>
  );
}

const meta = {
  title: 'Primitives/Button/Variants',
  component: ButtonGallery,
  decorators: [createDarkCanvasDecorator()],
} satisfies Meta<typeof ButtonGallery>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Variants: Story = {};

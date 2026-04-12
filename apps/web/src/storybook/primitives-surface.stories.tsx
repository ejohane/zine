import type { Meta, StoryObj } from '@storybook/react-vite';

import { Surface } from '@/components';

import { createDarkCanvasDecorator } from './decorators';

function SurfaceGallery() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Surface>
        <p className="eyebrow">Surface</p>
        <h2>Elevated</h2>
        <p>Default shared container used by the web shell.</p>
      </Surface>
      <Surface className="empty-state">
        <p className="eyebrow">Surface</p>
        <h2>Content Stress</h2>
        <p>
          Long body copy should still read as calm and deliberate under the same dark-first tokens.
        </p>
      </Surface>
    </div>
  );
}

const meta = {
  title: 'Primitives/Surface/States',
  component: SurfaceGallery,
  decorators: [createDarkCanvasDecorator()],
} satisfies Meta<typeof SurfaceGallery>;

export default meta;

type Story = StoryObj<typeof meta>;

export const States: Story = {};

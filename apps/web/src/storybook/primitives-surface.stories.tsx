import type { Meta, StoryObj } from '@storybook/react-vite';

import { Surface } from '@/components';

import { createDarkCanvasDecorator } from './decorators';

function SurfaceStoryCard({ title, description }: { title: string; description: string }) {
  return (
    <Surface className="grid gap-2 p-6 text-left">
      <p className="eyebrow">Surface</p>
      <h2 className="m-0 max-w-[12ch] font-sans text-[clamp(2.25rem,4vw,3.25rem)] leading-[0.92] tracking-[-0.05em] text-foreground">
        {title}
      </h2>
      <p className="m-0 max-w-[30ch] text-[1.05rem] leading-[1.65] text-[var(--text-dim)]">
        {description}
      </p>
    </Surface>
  );
}

function SurfaceGallery() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SurfaceStoryCard
        title="Elevated"
        description="Default shared container used by the web shell."
      />
      <SurfaceStoryCard
        title="Content Stress"
        description="Long body copy should still read as calm and deliberate under the same dark-first tokens."
      />
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

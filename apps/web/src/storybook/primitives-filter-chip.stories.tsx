import type { Meta, StoryObj } from '@storybook/react-vite';
import { ContentType } from '@zine/shared';

import { FilterChip } from '@/components/ui/filter-chip';

import { createDarkCanvasDecorator } from './decorators';

function FilterChipGallery() {
  return (
    <div className="rounded-[24px] border border-border bg-card p-6">
      <div className="flex flex-wrap gap-3">
        <FilterChip label="All" selected />
        <FilterChip label="Articles" tone={ContentType.ARTICLE} selected count={14} />
        <FilterChip label="Podcasts" tone={ContentType.PODCAST} selected count={6} />
        <FilterChip label="Videos" tone={ContentType.VIDEO} selected count={9} />
        <FilterChip label="Posts" tone={ContentType.POST} selected count={3} />
        <FilterChip label="Finished only" size="small" />
      </div>
    </div>
  );
}

const meta = {
  title: 'Primitives/Filter Chip/Tones',
  component: FilterChipGallery,
  decorators: [createDarkCanvasDecorator()],
} satisfies Meta<typeof FilterChipGallery>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Tones: Story = {};

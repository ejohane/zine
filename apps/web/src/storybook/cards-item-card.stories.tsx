import type { Meta, StoryObj } from '@storybook/react-vite';

import { ItemCardFixtures } from '@zine/design-system';

import { Button } from '@/components';
import { ItemCard, ItemCardView } from '@/components/item-card';

import { createDarkCanvasDecorator } from './decorators';

function ItemCardGallery() {
  return (
    <div className="grid gap-4">
      <ItemCardView
        item={{
          ...ItemCardFixtures.video,
          canonicalUrl: 'https://zine.example/watch/design-systems-at-scale',
          lastOpenedAt: '2025-02-18T09:45:00.000Z',
        }}
        shape="feature"
      />
      <ItemCard
        item={{
          ...ItemCardFixtures.article,
          summary:
            'Shared fixtures now drive the same dense editorial card surface used in the inbox and library.',
          canonicalUrl: 'https://zine.example/articles/stable-component-apis',
          bookmarkedAt: '2025-02-12T08:30:00.000Z',
        }}
        actionSlot={<Button tone="ghost">Archive</Button>}
      />
      <div className="max-w-[340px]">
        <ItemCardView
          item={{
            ...ItemCardFixtures.stress,
            summary:
              'Stress content keeps the same spacing, truncation, and metadata rhythm under the shared wrapper.',
            canonicalUrl: 'https://zine.example/posts/stress-card-layout',
            bookmarkedAt: '2025-02-14T13:20:00.000Z',
          }}
          shape="stack"
        />
      </div>
    </div>
  );
}

const meta = {
  title: 'Cards/Item Card/Reference',
  component: ItemCardGallery,
  decorators: [createDarkCanvasDecorator({ minHeight: 720 })],
} satisfies Meta<typeof ItemCardGallery>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Reference: Story = {};

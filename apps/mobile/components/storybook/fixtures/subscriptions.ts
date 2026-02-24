import type { Channel } from '@/components/subscriptions/channel-item';

export const subscriptionFixtures = {
  channels: [
    {
      providerChannelId: 'ch-1',
      name: 'Design Breakdown',
      description: 'Design systems and product decisions.',
      imageUrl: 'https://picsum.photos/seed/ch-1/112/112',
      subscriberCount: 230000,
    },
    {
      providerChannelId: 'ch-2',
      name: 'Mobile Engineering Radio',
      description: 'iOS, Android, and cross-platform engineering insights.',
      imageUrl: 'https://picsum.photos/seed/ch-2/112/112',
      subscriberCount: 98000,
    },
    {
      providerChannelId: 'ch-3',
      name: 'Product Signals',
      description: 'Weekly analysis on product strategy and team execution.',
      imageUrl: null,
      subscriberCount: 54000,
    },
  ] satisfies Channel[],
  selectedIds: new Set(['ch-1', 'ch-3']),
  subscribingIds: new Set(['ch-2']),
} as const;

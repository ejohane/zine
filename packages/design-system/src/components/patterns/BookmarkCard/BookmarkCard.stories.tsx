import type { Meta, StoryObj } from '@storybook/react';
import { BookmarkCard } from './BookmarkCard';

const meta: Meta<typeof BookmarkCard> = {
  title: 'Patterns/BookmarkCard',
  component: BookmarkCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    onEdit: { action: 'edit' },
    onDelete: { action: 'delete' },
    onOpen: { action: 'open' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Building a Design System',
    description: 'Learn how to build a scalable design system from scratch using modern tools and best practices.',
    url: 'https://example.com/design-system',
    tags: ['design', 'development', 'tutorial'],
    platform: 'web',
    savedAt: new Date(),
  },
};

export const Spotify: Story = {
  args: {
    title: 'The Daily - New York Times',
    description: 'This is what the news should sound like. Twenty minutes a day, five days a week.',
    url: 'https://open.spotify.com/show/123',
    tags: ['news', 'daily', 'podcast'],
    platform: 'spotify',
    savedAt: new Date(),
  },
};

export const YouTube: Story = {
  args: {
    title: 'React 19 Release Explained',
    description: 'Everything you need to know about the new features in React 19.',
    url: 'https://youtube.com/watch?v=123',
    tags: ['react', 'javascript', 'web'],
    platform: 'youtube',
    savedAt: new Date(),
  },
};

export const RSS: Story = {
  args: {
    title: 'Tech Blog RSS Feed',
    description: 'Latest articles from the tech blog covering modern web development.',
    url: 'https://techblog.com/feed.rss',
    tags: ['technology', 'blog', 'rss'],
    platform: 'rss',
    savedAt: new Date(),
  },
};

export const NoDescription: Story = {
  args: {
    title: 'Bookmark without description',
    url: 'https://example.com/no-desc',
    tags: ['minimal'],
    platform: 'web',
    savedAt: new Date(),
  },
};

export const ManyTags: Story = {
  args: {
    title: 'Article with many tags',
    description: 'This bookmark has lots of tags to show truncation behavior.',
    url: 'https://example.com/many-tags',
    tags: ['javascript', 'typescript', 'react', 'vue', 'angular', 'svelte', 'solid'],
    platform: 'web',
    savedAt: new Date(),
  },
};
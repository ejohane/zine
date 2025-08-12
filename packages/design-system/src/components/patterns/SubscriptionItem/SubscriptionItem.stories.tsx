import type { Meta, StoryObj } from '@storybook/react';
import { SubscriptionItem } from './SubscriptionItem';

const meta: Meta<typeof SubscriptionItem> = {
  title: 'Patterns/SubscriptionItem',
  component: SubscriptionItem,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    onPlay: { action: 'play' },
    onMarkPlayed: { action: 'markPlayed' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const SpotifyPodcast: Story = {
  args: {
    title: 'Episode 42: Building Better Products',
    author: 'Tech Talks Podcast',
    duration: '45:32',
    platform: 'spotify',
    isPlayed: false,
    isPlaying: false,
    publishedAt: new Date(),
  },
};

export const YouTubeVideo: Story = {
  args: {
    title: 'React Server Components Explained',
    author: 'Web Dev Simplified',
    thumbnail: 'https://picsum.photos/100',
    duration: '12:45',
    platform: 'youtube',
    isPlayed: false,
    isPlaying: false,
    publishedAt: new Date(),
  },
};

export const PodcastEpisode: Story = {
  args: {
    title: 'The Future of AI in Software Development',
    author: 'AI Weekly',
    duration: '1:02:15',
    platform: 'podcast',
    isPlayed: false,
    isPlaying: false,
    publishedAt: new Date(),
  },
};

export const Playing: Story = {
  args: {
    title: 'Currently Playing Episode',
    author: 'Tech Talks Podcast',
    thumbnail: 'https://picsum.photos/100',
    duration: '30:00',
    platform: 'spotify',
    isPlayed: false,
    isPlaying: true,
    publishedAt: new Date(),
  },
};

export const Played: Story = {
  args: {
    title: 'Already Watched Video',
    author: 'YouTube Creator',
    thumbnail: 'https://picsum.photos/100',
    duration: '15:00',
    platform: 'youtube',
    isPlayed: true,
    isPlaying: false,
    publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
  },
};

export const LongTitle: Story = {
  args: {
    title: 'This is a very long episode title that will be truncated to show how the component handles overflow of text content',
    author: 'Podcast with a Really Long Name That Also Gets Truncated',
    duration: '45:00',
    platform: 'podcast',
    isPlayed: false,
    isPlaying: false,
    publishedAt: new Date(),
  },
};
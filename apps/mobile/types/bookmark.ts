export interface Creator {
  id: string;
  name: string;
  handle?: string;
  avatarUrl?: string;
  verified?: boolean;
  subscriberCount?: number;
  platform: 'youtube' | 'spotify' | 'twitter' | 'web';
  url?: string;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  description?: string;
  thumbnailUrl?: string;
  creator?: Creator;
  contentType?: string;
  createdAt: string;
  publishedAt?: string;
  duration?: number;
  readingTime?: number;
  tags?: string[];
  notes?: string;
  isFavorite?: boolean;
  isArchived?: boolean;
}
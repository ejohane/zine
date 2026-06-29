import type { ItemCardData } from '@/components/item-card';
import {
  mapContentType,
  mapProvider,
  type ContentType,
  type Provider,
  type UIContentType,
} from '@/lib/content-utils';

type ItemCardDataSource = {
  id: string;
  title: string;
  creator: string;
  publisher?: string | null;
  creatorImageUrl?: string | null;
  thumbnailUrl?: string | null;
  contentType: ContentType;
  provider: Provider;
  duration?: number | null;
  readingTimeMinutes?: number | null;
};

export function mapItemToCardData(
  item: ItemCardDataSource,
  options: { contentType?: UIContentType } = {}
): ItemCardData {
  return {
    id: item.id,
    title: item.title,
    creator: item.publisher ?? item.creator,
    creatorImageUrl: item.creatorImageUrl ?? null,
    thumbnailUrl: item.thumbnailUrl ?? null,
    contentType: options.contentType ?? mapContentType(item.contentType),
    provider: mapProvider(item.provider),
    duration: item.duration ?? null,
    readingTimeMinutes: item.readingTimeMinutes ?? null,
  };
}

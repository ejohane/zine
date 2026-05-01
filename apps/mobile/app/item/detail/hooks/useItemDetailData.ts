import { useCreator } from '@/hooks/use-creator';
import {
  useItem,
  useItemEnrichment,
  useOtherUnfinishedBookmarksByCreator,
} from '@/hooks/use-items-trpc';

type ItemDetailDataInput = {
  id: string;
  isValid: boolean;
};

export function useItemDetailData({ id, isValid }: ItemDetailDataInput) {
  const { data: item, isLoading, error, refetch } = useItem(isValid ? id : '');
  const {
    data: enrichment,
    isLoading: enrichmentLoading,
    error: enrichmentError,
  } = useItemEnrichment(isValid ? id : '');
  const { data: otherBookmarksData } = useOtherUnfinishedBookmarksByCreator(isValid ? id : '');

  const { creator: creatorData } = useCreator(item?.creatorId ?? '');

  return {
    item,
    enrichment,
    enrichmentLoading,
    enrichmentError,
    otherUnfinishedBookmarks: otherBookmarksData?.items ?? [],
    isLoading,
    error,
    refetch,
    creatorData,
  };
}

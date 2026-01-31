import { useCreator } from '@/hooks/use-creator';
import { useItem } from '@/hooks/use-items-trpc';

type ItemDetailDataInput = {
  id: string;
  isValid: boolean;
};

export function useItemDetailData({ id, isValid }: ItemDetailDataInput) {
  const { data: item, isLoading, error, refetch } = useItem(isValid ? id : '');

  const { creator: creatorData } = useCreator(item?.creatorId ?? '');

  return {
    item,
    isLoading,
    error,
    refetch,
    creatorData,
  };
}

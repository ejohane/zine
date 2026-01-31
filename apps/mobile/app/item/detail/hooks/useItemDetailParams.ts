import { useLocalSearchParams } from 'expo-router';

import { validateItemId } from '@/lib/route-validation';

type ItemDetailParams = {
  id: string;
  isValid: boolean;
  message?: string;
};

export function useItemDetailParams(): ItemDetailParams {
  const { id } = useLocalSearchParams<{ id: string }>();
  const validation = validateItemId(id);

  if (!validation.success) {
    return {
      id: '',
      isValid: false,
      message: validation.message,
    };
  }

  return {
    id: validation.data,
    isValid: true,
  };
}

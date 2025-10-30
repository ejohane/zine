import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import { useAuth } from '../contexts/auth';
import type { ContentDetail } from '@zine/shared';

interface UseContentDetailOptions {
  enabled?: boolean;
}

export function useContentDetail(
  contentId: string | undefined,
  options?: UseContentDetailOptions
) {
  const { isSignedIn } = useAuth();

  return useQuery<ContentDetail | null>({
    queryKey: ['content', contentId],
    queryFn: async () => {
      if (!contentId) {
        console.warn('Content ID is missing');
        return null;
      }

      // Let React Query handle errors - don't catch here
      const content = await apiClient.get<ContentDetail>(`/api/v1/content/${contentId}`);
      return content;
    },
    enabled: options?.enabled !== false && isSignedIn && !!contentId,
    staleTime: 10 * 60 * 1000, // 10 minutes (content rarely changes)
    retry: 2,
  });
}

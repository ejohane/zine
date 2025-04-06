import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tag } from "@zine/core";

type GetTagsResponse = {
  result: Tag[];
};

export const useTags = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();

  const fetchWithToken = async () => {
    const token = await auth.getToken();
    const response = await fetch(
      `${process.env.EXPO_PUBLIC_API_URL}/tags`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const data: GetTagsResponse = await response.json();
    return data;
  };

  const query = useQuery({
    queryKey: ["get-tags"],
    queryFn: fetchWithToken,
  });

  const { mutate: createTag } = useMutation({
    mutationKey: ["create-tag"],
    mutationFn: async (tagName: string) => {
      const token = await auth.getToken();
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/tags`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: tagName }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to create tag");
      }

      return response.json();
    },
    // Optimistic update
    onMutate: async (tagName) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["get-tags"] });

      // Save the previous tags
      const previousTags = queryClient.getQueryData(["get-tags"]);

      // Optimistically update the cache
      queryClient.setQueryData<GetTagsResponse>(
        ["get-tags"],
        (old) => {
          const newTag: Tag = {
            id: 0, // Temporary ID
            name: tagName,
            createdAt: new Date(),
          };
          return { 
            result: [...(old?.result ?? []), newTag].sort((a, b) => 
              a.name.localeCompare(b.name)
            ) 
          };
        },
      );

      // Return context with previous tags for rollback
      return { previousTags };
    },
    // If the mutation fails, rollback using the previous value
    onError: (_err, _tagName, context) => {
      queryClient.setQueryData(["get-tags"], context?.previousTags);
    },
    // After success or error, refetch to ensure data is correct
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["get-tags"] });
    },
  });

  // Add a promise-based version of createTag
  const createTagAsync = async (tagName: string): Promise<Tag> => {
    return new Promise((resolve, reject) => {
      createTag(tagName, {
        onSuccess: (response) => {
          resolve(response.result);
        },
        onError: (error) => {
          reject(error);
        },
      });
    });
  };

  const { mutate: addTagToBookmark } = useMutation({
    mutationKey: ["add-tag-to-bookmark"],
    mutationFn: async ({ tagId, bookmarkId }: { tagId: number; bookmarkId: number }) => {
      const token = await auth.getToken();
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/tags/${tagId}/bookmarks/${bookmarkId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to add tag to bookmark");
      }

      return response.json();
    },
    // After success, invalidate the bookmarks query to refresh the data
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["get-bookmarks"] });
    },
  });

  const { mutate: removeTagFromBookmark } = useMutation({
    mutationKey: ["remove-tag-from-bookmark"],
    mutationFn: async ({ tagId, bookmarkId }: { tagId: number; bookmarkId: number }) => {
      const token = await auth.getToken();
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/tags/${tagId}/bookmarks/${bookmarkId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to remove tag from bookmark");
      }

      return response.json();
    },
    // After success, invalidate the bookmarks query to refresh the data
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["get-bookmarks"] });
    },
  });

  // Function to get tags for a specific bookmark
  const getBookmarkTags = async (bookmarkId: number) => {
    return queryClient.fetchQuery({
      queryKey: ["get-bookmark-tags", bookmarkId],
      queryFn: async () => {
        const token = await auth.getToken();
        const response = await fetch(
          `${process.env.EXPO_PUBLIC_API_URL}/tags/bookmarks/${bookmarkId}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );

        if (!response.ok) {
          throw new Error("Network response was not ok");
        }

        const data: GetTagsResponse = await response.json();
        return data;
      },
    });
  };

  return {
    tags: {
      result: query.data?.result,
      isLoading: query.isLoading,
      error: query.error,
    },
    createTag,
    createTagAsync,
    addTagToBookmark,
    removeTagFromBookmark,
    getBookmarkTags,
  };
}; 
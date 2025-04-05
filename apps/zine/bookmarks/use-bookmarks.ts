import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Content } from "@zine/core";

type GetBookmarksResponse = {
  result: Bookmark[];
};

export const useBookmarks = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();

  const fetchWithToken = async () => {
    const token = await auth.getToken();
    const response = await fetch(
      `${process.env.EXPO_PUBLIC_API_URL}/bookmarks`,
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

    const data: GetBookmarksResponse = await response.json();
    return data;
  };

  const query = useQuery({
    queryKey: ["get-bookmarks"],
    queryFn: fetchWithToken,
  });

  const { mutate } = useMutation({
    mutationKey: ["add-bookmark"],
    mutationFn: async (content: Content) => {
      const token = await auth.getToken();
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/bookmarks`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: content.url }),
        },
      );

      return response.json();
    },
    // Optimistic update
    onMutate: async (content) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["get-bookmarks"] });

      // Save the previous todos
      const previousBookmarks = queryClient.getQueryData(["get-bookmarks"]);

      // Optimistically update the cache
      queryClient.setQueryData<GetBookmarksResponse>(
        ["get-bookmarks"],
        (old) => {
          const newBookmarks: Bookmark[] = [
            {
              id: 0,
              isArchived: false,
              userId: "",
              createdAt: new Date(),
              updatedAt: new Date(),
              content,
            },
            ...(old?.result ?? []),
          ];
          return { result: newBookmarks };
        },
      );

      // Return context with previous todos for rollback
      return { previousBookmarks };
    },
    // If the mutation fails, rollback using the previous value
    onError: (_err, _updatedBookmarks, context) => {
      queryClient.setQueryData(["get-bookmarks"], context?.previousBookmarks);
    },
    // After success or error, refetch to ensure data is correct
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["get-bookmarks"] });
    },
  });

  const { mutate: deleteBookmarkMutate } = useMutation({
    mutationKey: ["delete-bookmark"],
    mutationFn: async (bookmarkId: number) => {
      const token = await auth.getToken();
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/bookmarks/${bookmarkId}/archive`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to delete bookmark");
      }

      return response.json();
    },
    // Optimistic update
    onMutate: async (bookmarkId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["get-bookmarks"] });

      // Save the previous bookmarks
      const previousBookmarks = queryClient.getQueryData(["get-bookmarks"]);

      // Optimistically update the cache
      queryClient.setQueryData<GetBookmarksResponse>(
        ["get-bookmarks"],
        (old) => {
          const newBookmarks =
            old?.result.filter((bookmark) => bookmark.id !== bookmarkId) ?? [];
          return { result: newBookmarks };
        },
      );

      // Return context with previous bookmarks for rollback
      return { previousBookmarks };
    },
    // If the mutation fails, rollback using the previous value
    onError: (_err, _bookmarkId, context) => {
      queryClient.setQueryData(["get-bookmarks"], context?.previousBookmarks);
    },
    // After success or error, refetch to ensure data is correct
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["get-bookmarks"] });
    },
  });

  return {
    bookmarks: {
      result: query.data?.result,
      isLoading: query.isLoading,
      error: query.error,
    },
    saveBookmark: mutate,
    deleteBookmark: deleteBookmarkMutate,
  };
};

import { client } from "@/utils/api";
import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery } from "@tanstack/react-query";

export const useBookmarks = () => {
  const auth = useAuth();

  const fetchWithToken = async () => {
    const token = await auth.getToken();
    const response = await client.bookmarks.$get(
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    return response.json();
  };

  const query = useQuery({
    queryKey: ["get-bookmarks"],
    queryFn: fetchWithToken,
  });

  const { mutate } = useMutation({
    mutationKey: ["add-bookmark"],
    mutationFn: async (url: string) => {
      const token = await auth.getToken();
      const response = await client.bookmarks.$post(
        { json: { url } },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      return response.json();
    },
  });

  return {
    bookmarks: {
      result: query.data?.result,
      isLoading: query.isLoading,
      error: query.error,
    },
    saveBookmark: mutate,
  };
};

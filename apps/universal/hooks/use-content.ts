import { client } from "@/utils/api";
import { useAuth } from "@clerk/clerk-expo";
import { useMutation } from "@tanstack/react-query";

type ContentPreview = {
  title: string;
};

export const useContent = () => {
  const auth = useAuth();

  const { mutate } = useMutation({
    mutationKey: ["preview-content"],
    mutationFn: async (url: string) => {
      const token = await auth.getToken();
      const response = await client.content.preview.$post(
        { json: { url } },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    },
  });

  const preview = async (url: string): Promise<ContentPreview> => {
    return new Promise((resolve, reject) => {
      mutate(url, {
        onSuccess: (data: any) => {
          return resolve({ title: data.title });
        },
        onError: (error: any) => {
          return reject(error);
        },
      });
    });
  };

  return {
    preview,
  };
};

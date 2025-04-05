import { useAuth } from "@clerk/clerk-expo";
import { useMutation } from "@tanstack/react-query";
import { Content } from "@zine/core";

const URL = `${process.env.EXPO_PUBLIC_API_URL}/content/preview`;

export const useContent = () => {
  const auth = useAuth();

  const { mutate, isPending } = useMutation<Content, any, string>({
    mutationKey: ["preview-content"],
    mutationFn: async (url: string) => {
      const token = await auth.getToken();
      const response = await fetch(URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    },
  });

  const preview = async (url: string): Promise<Content> => {
    return new Promise((resolve, reject) => {
      return mutate(url, {
        onSuccess: (content) => {
          return resolve(content);
        },
        onError: (error: any) => {
          return reject(error);
        },
      });
    });
  };

  return {
    preview,
    isPending,
  };
};

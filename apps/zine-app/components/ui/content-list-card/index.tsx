import { Linking } from "react-native";
import { Box } from "../box";
import { Icon } from "../icon";
import { Image } from "../image";
import { Pressable } from "../pressable";
import { Text } from "../text";
import { BookIcon } from "lucide-react-native";

type ContentListCardProps = {
  url: string;
  title?: string | null;
  image?: string | null;
  author?: string | null;
};

export const ContentListCard = ({
  url,
  title,
  image,
  author,
}: ContentListCardProps) => {
  return (
    <Pressable
      onPress={() => {
        Linking.openURL(url);
      }}
    >
      <Box className="flex flex-row p-4 gap-3 items-center">
        <Image
          alt="image"
          source={{
            uri: image ?? "",
          }}
          className="h-16 w-16 rounded-lg"
        />

        <Box className="flex-1 flex-col justify-center">
          <Text className="font-semibold text-xl line-clamp-2">{title}</Text>
          {author && (
            <Box className="flex flex-row items-center gap-2 pt-1">
              <Icon as={BookIcon} size="sm" color="white" />
              <Text className="text-sm">•</Text>
              <Text className="text-sm">{author}</Text>
            </Box>
          )}
        </Box>
      </Box>
    </Pressable>
  );
};

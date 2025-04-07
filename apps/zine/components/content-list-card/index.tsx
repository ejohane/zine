import { Linking, Animated, Dimensions } from "react-native";
import { Pressable } from "../ui/pressable";
import { Box } from "../ui/box";
import { Image } from "../ui/image";
import { Text } from "../ui/text";
import { Icon } from "../ui/icon";
import { BookIcon, Trash2Icon, HeadphonesIcon, TvIcon, NewspaperIcon, XIcon, GlobeIcon } from "lucide-react-native";
import {
  GestureHandlerRootView,
  Swipeable,
} from "react-native-gesture-handler";
import { router } from "expo-router";
import { ContentType } from "@zine/core";
import { Bookmark } from "@zine/core";

type ContentListCardProps = {
  bookmark: Bookmark;
  onDelete?: () => void;
};

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DELETE_THRESHOLD = SCREEN_WIDTH * 0.3;

const getContentTypeIcon = (type?: ContentType) => {
  switch (type) {
    case "audio":
      return HeadphonesIcon;
    case "video":
      return TvIcon;
    case "article":
      return NewspaperIcon;
    case "post":
      return XIcon;
    case "link":
      return GlobeIcon;
    default:
      return BookIcon;
  }
};

export const ContentListCard = ({
  bookmark,
}: ContentListCardProps) => {
  const handlePress = () => {
    if (bookmark.id) {
      router.push(`/content/${bookmark.id.toString()}`);
    } else {
      Linking.openURL(bookmark.content.url);
    }
  };

  const ContentIcon = getContentTypeIcon(bookmark.content.type);

  return (
    <Pressable onPress={handlePress}>
      <Box className="flex flex-row p-4 gap-3 items-center bg-background-0">
        <Image
          alt="image"
          source={{ uri: bookmark.content.author?.image ?? bookmark.content.image ?? "" }}
          className="h-16 w-16 rounded-lg"
        />
        <Box className="flex-1 flex-col justify-center">
          <Text className="font-semibold text-xl line-clamp-2">{bookmark.content.title}</Text>
          {bookmark.content.author?.name && (
            <Box className="flex flex-row items-center gap-2 pt-1">
              <Icon as={ContentIcon} size="sm" />
              <Text className="text-sm">•</Text>
              <Text className="text-sm">{bookmark.content.author.name}</Text>
            </Box>
          )}
        </Box>
      </Box>
    </Pressable>
  );
};

export const SwipeableContentCard = ({
  bookmark,
  onDelete,
}: ContentListCardProps) => {
  // Render the right swipe action (delete button)
  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
  ) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [100, 0], // Slide in from the right
    });

    return (
      <Animated.View
        style={{
          transform: [{ translateX }],
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
          width: 100,
          backgroundColor: "rgb(var(--color-background-error))",
        }}
      >
        <Box className="p-2 rounded-full bg-error-600 mr-4">
          <Icon as={Trash2Icon} className="text-background-0" />
        </Box>
      </Animated.View>
    );
  };

  return (
    <GestureHandlerRootView>
      <Swipeable
        friction={2} // Controls swipe resistance
        rightThreshold={DELETE_THRESHOLD} // Distance to swipe before triggering delete
        renderRightActions={renderRightActions}
        onSwipeableWillOpen={(direction) => {
          if (direction === "right" && onDelete) {
            // Call onDelete immediately when the swipeable is about to open
            // This happens when the user releases the swipeable item and it's within the threshold
            onDelete();
          }
        }}
      >
        <ContentListCard
          bookmark={bookmark}
        />
      </Swipeable>
    </GestureHandlerRootView>
  );
};

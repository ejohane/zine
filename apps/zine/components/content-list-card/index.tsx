import { Linking, Animated, Dimensions } from "react-native";
import { Pressable } from "../ui/pressable";
import { Box } from "../ui/box";
import { Image } from "../ui/image";
import { Text } from "../ui/text";
import { Icon } from "../ui/icon";
import { BookIcon, Trash2Icon } from "lucide-react-native";
import {
  GestureHandlerRootView,
  PanGestureHandler,
  PanGestureHandlerGestureEvent,
  Swipeable,
} from "react-native-gesture-handler";
import { useCallback, useRef } from "react";

type ContentListCardProps = {
  url: string;
  title?: string;
  image?: string;
  author?: string;
  onDelete?: () => void;
};

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DELETE_THRESHOLD = SCREEN_WIDTH * 0.3;

export const ContentListCard = ({
  url,
  title,
  image,
  author,
}: ContentListCardProps) => {
  return (
    <Pressable onPress={() => Linking.openURL(url)}>
      <Box className="flex flex-row p-4 gap-3 items-center bg-background-0">
        <Image
          alt="image"
          source={{ uri: image ?? "" }}
          className="h-16 w-16 rounded-lg"
        />
        <Box className="flex-1 flex-col justify-center">
          <Text className="font-semibold text-xl line-clamp-2">{title}</Text>
          {author && (
            <Box className="flex flex-row items-center gap-2 pt-1">
              <Icon as={BookIcon} size="sm" />
              <Text className="text-sm">•</Text>
              <Text className="text-sm">{author}</Text>
            </Box>
          )}
        </Box>
      </Box>
    </Pressable>
  );
};

export const SwipeableContentCard = ({
  url,
  title,
  image,
  author,
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
        onSwipeableOpen={(direction) => {
          if (direction === "right" && onDelete) {
            onDelete();
          }
        }}
      >
        <ContentListCard
          url={url}
          title={title}
          image={image}
          author={author}
        />
      </Swipeable>
    </GestureHandlerRootView>
  );
};

// export const ContentListCard = ({
//   url,
//   title,
//   image,
//   author,
//   onDelete,
// }: ContentListCardProps) => {
//   return (
//     <Pressable
//       onPress={() => {
//         Linking.openURL(url);
//       }}
//     >
//       <Box className="flex flex-row p-4 gap-3 items-center">
//         <Image
//           alt="image"
//           source={{
//             uri: image ?? "",
//           }}
//           className="h-16 w-16 rounded-lg"
//         />
//
//         <Box className="flex-1 flex-col justify-center">
//           <Text className="font-semibold text-xl line-clamp-2">{title}</Text>
//           {author && (
//             <Box className="flex flex-row items-center gap-2 pt-1">
//               <Icon as={BookIcon} size="sm" />
//               <Text className="text-sm">•</Text>
//               <Text className="text-sm">{author}</Text>
//             </Box>
//           )}
//         </Box>
//       </Box>
//     </Pressable>
//   );
// };
//
// export const SwipeableContentCard = ({
//   url,
//   title,
//   image,
//   author,
//   onDelete,
// }: ContentListCardProps) => {
//   const translateX = useRef(new Animated.Value(0)).current;
//   const swipeThreshold = DELETE_THRESHOLD;
//
//   const resetPosition = () => {
//     Animated.spring(translateX, {
//       toValue: 0,
//       useNativeDriver: true,
//     }).start();
//   };
//
//   const deleteItem = () => {
//     Animated.timing(translateX, {
//       toValue: SCREEN_WIDTH,
//       duration: 200,
//       useNativeDriver: true,
//     }).start(() => {
//       if (onDelete) {
//         onDelete();
//       }
//     });
//   };
//
//   const onGestureEvent = useCallback(
//     (event: PanGestureHandlerGestureEvent) => {
//       const { translationX } = event.nativeEvent;
//
//       // Only allow swiping right
//       if (translationX <= 0) return;
//
//       translateX.setValue(translationX);
//     },
//     [translateX],
//   );
//
//   const onHandlerStateChange = useCallback(
//     (event: PanGestureHandlerGestureEvent) => {
//       if (event.nativeEvent.state === 5) {
//         // END state
//         const { translationX } = event.nativeEvent;
//
//         if (translationX >= swipeThreshold) {
//           deleteItem();
//         } else {
//           resetPosition();
//         }
//       }
//     },
//     [swipeThreshold],
//   );
//
//   // Background delete view that shows as card swipes
//   const renderBackgroundDelete = () => {
//     return (
//       <Box className="absolute right-4 h-full justify-center">
//         <Box className="p-2 rounded-full bg-red-600">
//           <Icon as={Trash2Icon} color="white" />
//         </Box>
//       </Box>
//     );
//   };
//
//   return (
//     <GestureHandlerRootView>
//       <Box className="relative">
//         {renderBackgroundDelete()}
//         <PanGestureHandler
//           onGestureEvent={onGestureEvent}
//           onHandlerStateChange={onHandlerStateChange}
//         >
//           <Animated.View
//             style={{
//               transform: [{ translateX }],
//               backgroundColor: "black",
//             }}
//           >
//             <ContentListCard
//               url={url}
//               title={title}
//               image={image}
//               author={author}
//             />
//           </Animated.View>
//         </PanGestureHandler>
//       </Box>
//     </GestureHandlerRootView>
//   );
// };

import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Text } from "@/components/ui/text";
import { Box } from "@/components/ui/box";
import { useBookmarks } from "@/bookmarks/use-bookmarks";
import { Pressable } from "@/components/ui/pressable";
import { Icon } from "@/components/ui/icon";
import {
  ChevronLeftIcon,
  CheckSquareIcon,
  FolderPlusIcon,
  ShareIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  GlobeIcon,
  RssIcon,
  YoutubeIcon,
  TwitterIcon,
} from "lucide-react-native";
import { Image } from "@/components/ui/image";
import { ScrollView } from "@/components/ui/scroll-view";
import { useState, useMemo } from "react";
import { Linking } from "react-native";
import * as Haptics from 'expo-haptics';
import React from 'react';
import { formatDate, formatDuration } from "@/utils/format";

export default function ContentPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bookmarks } = useBookmarks();
  const router = useRouter();
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  // Find the bookmark with the matching ID
  const bookmark = bookmarks.result?.find(
    (bookmark) => bookmark.id.toString() === id,
  );

  // Get the URL from the bookmark
  const contentUrl = bookmark?.content.url || "";

  // Get service-specific styling
  const serviceStyle = useMemo(() => {
    switch (bookmark?.content?.service?.name) {
      case "spotify":
        return {
          bgColor: "bg-[#1DB954]",
          icon: YoutubeIcon,
          text: "Open in Spotify",
        };
      case "youtube":
        return {
          bgColor: "bg-[#FF0000]",
          icon: YoutubeIcon,
          text: "Open in YouTube",
        };
      case "x":
        return {
          bgColor: "bg-background-800",
          icon: TwitterIcon,
          text: "Open in X",
        };
      case "rss":
        return {
          bgColor: "bg-orange-400",
          icon: RssIcon,
          text: "Open in Podcast",
        };
      case "web":
      default:
        return {
          bgColor: "bg-blue-500",
          icon: GlobeIcon,
          text: "Open in Browser",
        };
    }
  }, [bookmark]);

  const data = {
    creator: bookmark?.content.author?.name || "",
    publishDate: formatDate(bookmark?.content.publishedDate),
    duration: formatDuration(bookmark?.content.duration),
    thumbnailUrl: bookmark?.content.image || "",
    description:
      bookmark?.content.description ||
      "No description available for this content.",
  };

  const isDescriptionLong = useMemo(() => {
    return data.description.length > 300;
  }, [data]);

  // Toggle description expansion
  const toggleDescription = () => {
    setIsDescriptionExpanded(!isDescriptionExpanded);
  };

  // Open the URL
  const openUrl = () => {
    if (contentUrl) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Linking.openURL(contentUrl);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background-0">
      <Stack.Screen
        options={{
          headerShown: false, // Hide the default header
        }}
      />

      {/* Custom header */}
      <Box className={`flex-row items-center p-4 bg-background-0`}>
        <Pressable onPress={() => router.back()} className="mr-4">
          <Icon as={ChevronLeftIcon} size="lg" />
        </Pressable>
        <Box className="flex-1" />
      </Box>

      <ScrollView>
        <Box className="p-4">
          <Box className="w-full items-center">
            <Box className="aspect-square w-4/5 bg-background-200 rounded-2xl overflow-hidden mb-4">
              {data.thumbnailUrl ? (
                <Image
                  source={{ uri: data.thumbnailUrl }}
                  className="w-full h-full"
                  resizeMode="cover"
                />
              ) : (
                <Box className="w-full h-full items-center justify-center">
                  <Text className="text-background-500">
                    No thumbnail available
                  </Text>
                </Box>
              )}
            </Box>
          </Box>

          <Text className="text-2xl font-semibold mb-4">
            {bookmark?.content.title || "Content Title"}
          </Text>

          <Box className="flex-row items-center mb-4">
            {bookmark?.content.author?.image && (
              <Image
                source={{ uri: bookmark.content.author.image }}
                className="w-6 h-6 rounded-full mr-2"
              />
            )}
            <Text className="text-background-700 font-medium">
              {data.creator}
            </Text>
          </Box>

          <Box className="flex-row items-center mb-4">
            <Text className="text-background-600">{data.publishDate}</Text>
            {data.duration && (
              <>
                <Text className="text-background-500 mx-2">•</Text>
                <Text className="text-background-600">{data.duration}</Text>
              </>
            )}
          </Box>

          <Box className="flex-row justify-between items-center mb-4">
            <Box className="flex-row space-x-8 gap-4">
              <Pressable className="w-10 h-10 items-center justify-center">
                <Icon
                  as={CheckSquareIcon}
                  size="xl"
                  className="text-background-600"
                />
              </Pressable>
              <Pressable className="w-10 h-10 items-center justify-center">
                <Icon
                  as={FolderPlusIcon}
                  size="xl"
                  className="text-background-600"
                />
              </Pressable>
              <Pressable className="w-10 h-10 items-center justify-center">
                <Icon
                  as={ShareIcon}
                  size="xl"
                  className="text-background-600"
                />
              </Pressable>
            </Box>

            <Pressable
              onPress={openUrl}
              className={`flex-row items-center ${serviceStyle.bgColor} px-4 py-2 rounded-full`}
            >
              <Icon
                as={serviceStyle.icon}
                size="xl"
                className="text-background-0 mr-2"
              />
              <Text className="text-background-0 mr-2 font-semibold">
                {serviceStyle.text}
              </Text>
            </Pressable>
          </Box>

          <Pressable
            onPress={isDescriptionLong ? toggleDescription : undefined}
          >
            <Box className="bg-background-100 p-4 rounded-lg">
              <Text
                className={`text-background-700 leading-6 ${!isDescriptionExpanded && isDescriptionLong ? "line-clamp-6" : ""}`}
                numberOfLines={isDescriptionExpanded ? undefined : 6}
              >
                {data.description}
              </Text>

              {isDescriptionLong && (
                <Box className="flex-row items-center justify-end mt-2">
                  <Text className="text-background-500 mr-1">
                    {isDescriptionExpanded ? "Show less" : "...more"}
                  </Text>
                  <Icon
                    as={isDescriptionExpanded ? ChevronUpIcon : ChevronDownIcon}
                    size="sm"
                    className="text-background-500"
                  />
                </Box>
              )}
            </Box>
          </Pressable>
        </Box>
      </ScrollView>
    </SafeAreaView>
  );
}


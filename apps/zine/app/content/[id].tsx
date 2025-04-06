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
    TwitterIcon
} from "lucide-react-native";
import { useColorScheme } from "@/components/useColorScheme";
import { Image } from "@/components/ui/image";
import { ScrollView } from "@/components/ui/scroll-view";
import { useState, useMemo } from "react";
import { Linking } from "react-native";

export default function ContentPage() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { bookmarks } = useBookmarks();
    const router = useRouter();
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

    // Find the bookmark with the matching ID
    const bookmark = bookmarks.result?.find(
        (bookmark) => bookmark.id.toString() === id
    );

    // Get the URL from the bookmark
    const contentUrl = bookmark?.content.url || "";

    // Get service-specific styling
    const serviceStyle = useMemo(() => {
        switch (bookmark?.content?.service?.name) {
            case "spotify":
                return {
                    bgColor: "bg-green-400",
                    icon: YoutubeIcon,
                    text: "Open in Spotify"
                };
            case "youtube":
                return {
                    bgColor: "bg-red-400",
                    icon: YoutubeIcon,
                    text: "Open in YouTube"
                };
            case "x":
                return {
                    bgColor: "bg-background-800",
                    icon: TwitterIcon,
                    text: "Open in X"
                };
            case "rss":
                return {
                    bgColor: "bg-orange-400",
                    icon: RssIcon,
                    text: "Open in Podcast"
                };
            case "web":
            default:
                return {
                    bgColor: "bg-blue-400",
                    icon: GlobeIcon,
                    text: "Open in Browser"
                };
        }
    }, [bookmark]);

    // Format date to be more readable (e.g., "Aug 8th 2025")
    const formatDate = (date: Date | string | null | undefined): string => {
        if (!date) return "No date available";

        const dateObj = date instanceof Date ? date : new Date(date);

        // Check if date is valid
        if (isNaN(dateObj.getTime())) return "Invalid date";

        const months = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
        ];

        const day = dateObj.getDate();
        const month = months[dateObj.getMonth()];
        const year = dateObj.getFullYear();

        // Add ordinal suffix to day
        const dayWithSuffix = day + getOrdinalSuffix(day);

        return `${month} ${dayWithSuffix} ${year}`;
    };

    // Helper function to get ordinal suffix
    const getOrdinalSuffix = (day: number): string => {
        if (day > 3 && day < 21) return "th";
        switch (day % 10) {
            case 1: return "st";
            case 2: return "nd";
            case 3: return "rd";
            default: return "th";
        }
    };

    const data = {
        creator: bookmark?.content.author?.name || "",
        publishDate: formatDate(bookmark?.content.publishedDate),
        thumbnailUrl: bookmark?.content.image || "",
        description: bookmark?.content.description ||
            "No description available for this content."

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
                <Box className="flex-1" /> {/* Empty box for balance */}
            </Box>

            <ScrollView className="flex-1">
                <Box className="p-4">
                    {/* 1. Content thumbnail placeholder */}
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
                                    <Text className="text-background-500">No thumbnail available</Text>
                                </Box>
                            )}
                        </Box>
                    </Box>

                    {/* Title */}
                    <Text className="text-2xl font-semibold mb-4">
                        {bookmark?.content.title || "Content Title"}
                    </Text>

                    {/* 2. Creator info row */}
                    <Box className="flex-row items-center mb-4">
                        <Text className="text-background-700 font-medium mr-2">{data.creator}</Text>
                        <Text className="text-background-500 mr-2">•</Text>
                        <Text className="text-background-600">{data.publishDate}</Text>
                    </Box>

                    {/* 3 & 4. Utility actions row and Open Link button */}
                    <Box className="flex-row justify-between items-center mb-4">
                        {/* Utility icons */}
                        <Box className="flex-row space-x-8 gap-4">
                            <Pressable className="w-10 h-10 items-center justify-center">
                                <Icon as={CheckSquareIcon} size="xl" className="text-background-600" />
                            </Pressable>
                            <Pressable className="w-10 h-10 items-center justify-center">
                                <Icon as={FolderPlusIcon} size="xl" className="text-background-600" />
                            </Pressable>
                            <Pressable className="w-10 h-10 items-center justify-center">
                                <Icon as={ShareIcon} size="xl" className="text-background-600" />
                            </Pressable>
                        </Box>

                        {/* Open Link button */}
                        <Pressable
                            onPress={openUrl}
                            className={`flex-row items-center ${serviceStyle.bgColor} px-4 py-2 rounded-full`}
                        >
                            <Icon as={serviceStyle.icon} size="xl" className="text-background-0 mr-2" />
                            <Text className="text-background-0 mr-2">{serviceStyle.text}</Text>
                        </Pressable>
                    </Box>

                    {/* 5. Content description - expandable */}
                    <Pressable onPress={isDescriptionLong ? toggleDescription : undefined}>
                        <Box className="bg-background-100 p-4 rounded-lg">
                            <Text
                                className={`text-background-700 leading-6 ${!isDescriptionExpanded && isDescriptionLong ? 'line-clamp-6' : ''}`}
                                numberOfLines={isDescriptionExpanded ? undefined : 6}
                            >
                                {data.description}
                            </Text>

                            {/* Show "more" or "less" indicator only if description is long */}
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
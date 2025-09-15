// @ts-nocheck
import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  Share,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Chip, Skeleton } from 'heroui-native';
import { Feather } from '@expo/vector-icons';
import { useBookmarkDetail } from '../../../hooks/useBookmarkDetail';
import { useAuth } from '../../../contexts/auth';
import { formatDistanceToNow } from '../../../lib/dateUtils';
import { getPlatformInfo } from '../../../lib/platformIcons';
import { api } from '../../../lib/api';
import { useQueryClient } from '@tanstack/react-query';

export default function BookmarkDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isSignedIn, getToken } = useAuth();
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    data: bookmark,
    isLoading,
    error,
    refetch,
  } = useBookmarkDetail(id, {
    enabled: isSignedIn && !!id,
  });

  const handleOpenLink = async () => {
    if (bookmark?.url) {
      try {
        await Linking.openURL(bookmark.url);
      } catch (error) {
        Alert.alert('Error', 'Could not open the link');
      }
    }
  };

  const handleShare = async () => {
    if (bookmark) {
      try {
        await Share.share({
          title: bookmark.title,
          message: `Check out this bookmark: ${bookmark.title}\n${bookmark.url}`,
          url: bookmark.url,
        });
      } catch (error) {
        Alert.alert('Error', 'Could not share bookmark');
      }
    }
  };

  const handleEdit = () => {
    router.push(`/bookmark/edit/${id}`);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Bookmark',
      'Are you sure you want to delete this bookmark?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!id) return;
            
            setIsDeleting(true);
            try {
              const token = await getToken();
              if (!token) {
                Alert.alert('Error', 'Authentication required');
                return;
              }
              await api.deleteBookmark(id, token);
              queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
              queryClient.invalidateQueries({ queryKey: ['recent-bookmarks'] });
              router.back();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete bookmark');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (!isSignedIn) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <Stack.Screen
          options={{
            title: 'Bookmark',
            headerBackTitle: 'Back',
          }}
        />
        <View className="flex-1 items-center justify-center px-6">
          <Feather name="lock" size={64} color="#6b7280" />
          <Text className="mt-4 text-lg font-semibold text-gray-900">
            Sign in required
          </Text>
          <Text className="mt-2 text-center text-gray-600">
            Please sign in to view bookmark details
          </Text>
          <Button
            onPress={() => router.push('/sign-in')}
            className="mt-6"
          >
            Sign In
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <Stack.Screen
          options={{
            title: 'Loading...',
            headerBackTitle: 'Back',
          }}
        />
        <ScrollView className="flex-1 px-4 py-4">
          <Card className="p-4">
            <Skeleton className="h-8 w-3/4 mb-4" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-5/6 mb-4" />
            <View className="flex-row gap-2 mb-4">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </View>
            <Skeleton className="h-32 w-full mb-4" />
            <View className="flex-row gap-2">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 flex-1" />
            </View>
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (error || !bookmark) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <Stack.Screen
          options={{
            title: 'Error',
            headerBackTitle: 'Back',
          }}
        />
        <View className="flex-1 items-center justify-center px-6">
          <Feather name="alert-circle" size={64} color="#ef4444" />
          <Text className="mt-4 text-lg font-semibold text-gray-900">
            {error ? 'Failed to load bookmark' : 'Bookmark not found'}
          </Text>
          <Text className="mt-2 text-center text-gray-600">
            {error?.message || 'This bookmark may have been deleted'}
          </Text>
          <View className="flex-row gap-2 mt-6">
            <Button
              onPress={() => router.back()}
            >
              Go Back
            </Button>
            {error && (
              <Button onPress={() => refetch()}>
                Retry
              </Button>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const platformInfo = getPlatformInfo(bookmark.url);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <Stack.Screen
        options={{
          title: bookmark.title.slice(0, 30) + (bookmark.title.length > 30 ? '...' : ''),
          headerBackTitle: 'Back',
        }}
      />
      <ScrollView className="flex-1 px-4 py-4">
        <Card className="p-4 mb-4">
          <Text className="text-xl font-bold text-gray-900 mb-2">
            {bookmark.title}
          </Text>
          
          {bookmark.description && (
            <Text className="text-gray-600 mb-4">{bookmark.description}</Text>
          )}

          <View className="flex-row flex-wrap gap-2 mb-4">
            <Chip
              startContent={platformInfo.icon}
            >
              {platformInfo.name}
            </Chip>
            
            {bookmark.contentType && (
              <Chip>
                {bookmark.contentType.charAt(0).toUpperCase() + 
                 bookmark.contentType.slice(1).toLowerCase()}
              </Chip>
            )}
            
            <Chip>
              {formatDistanceToNow(bookmark.createdAt)}
            </Chip>
          </View>

          {bookmark.excerpt && (
            <View className="bg-gray-50 rounded-lg p-3 mb-4">
              <Text className="text-sm text-gray-700">{bookmark.excerpt}</Text>
            </View>
          )}

          <View className="border-t border-gray-200 pt-4 mb-4">
            <Text className="text-xs text-gray-500 mb-1">URL</Text>
            <Text 
              className="text-sm text-blue-600"
              numberOfLines={2}
              onPress={handleOpenLink}
            >
              {bookmark.url}
            </Text>
          </View>

          {bookmark.tags && bookmark.tags.length > 0 && (
            <View className="mb-4">
              <Text className="text-xs text-gray-500 mb-2">Tags</Text>
              <View className="flex-row flex-wrap gap-1">
                {bookmark.tags.map((tag, index) => (
                  <Chip key={index} size="sm">
                    {tag}
                  </Chip>
                ))}
              </View>
            </View>
          )}

          <View className="flex-row gap-2">
            <Button
              onPress={handleOpenLink}
              className="flex-1"
              startContent={<Feather name="external-link" size={16} color="white" />}
            >
              Open Link
            </Button>
            <Button
              onPress={handleShare}
              className="flex-1"
              startContent={<Feather name="share-2" size={16} color="#7c3aed" />}
            >
              Share
            </Button>
          </View>
        </Card>

        <Card className="p-4">
          <Text className="text-sm font-semibold text-gray-700 mb-3">
            Actions
          </Text>
          <View className="gap-2">
            <Button
              onPress={handleEdit}
              startContent={<Feather name="edit-2" size={16} color="#6b7280" />}
              className="justify-start"
            >
              Edit Bookmark
            </Button>
            <Button
              onPress={handleDelete}
              startContent={<Feather name="trash-2" size={16} color="#ef4444" />}
              className="justify-start"
              isLoading={isDeleting}
              disabled={isDeleting}
            >
              Delete Bookmark
            </Button>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
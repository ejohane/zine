import { useRef } from 'react';
import {
  View,
  Text,
  Alert,
  Linking,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useContentDetail } from '../../../hooks/useContentDetail';
import { useSaveBookmarkFromContent } from '../../../hooks/useSaveBookmarkFromContent';
import { useAuth } from '../../../contexts/auth';
import { useTheme } from '../../../contexts/theme';
import { BookmarkContentDisplay } from '../../../components/content-display';
import { SaveBookmarkButton, OpenLinkButton } from '../../../components/action-buttons';

export default function ContentViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { colors } = useTheme();
  const scrollY = useRef(new Animated.Value(0)).current;

  const {
    data: content,
    isLoading,
    error,
    refetch,
  } = useContentDetail(id, {
    enabled: isSignedIn && !!id,
  });

  const saveMutation = useSaveBookmarkFromContent({
    onSuccess: (bookmark) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/bookmark/${bookmark.id}` as any);
    },
    onDuplicate: (existingBookmarkId) => {
      Alert.alert('Already Saved', 'This content is already in your bookmarks.', [
        {
          text: 'View Bookmark',
          onPress: () => router.replace(`/bookmark/${existingBookmarkId}` as any),
        },
        { text: 'OK', style: 'cancel' },
      ]);
    },
    onError: (error) => {
      Alert.alert('Error', error.message || 'Failed to save bookmark');
    },
  });

  const openUrl = async (targetUrl: string) => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await Linking.openURL(targetUrl);
    } catch (error) {
      Alert.alert('Error', 'Could not open the link');
    }
  };

  const handleSave = () => {
    if (!id) return;
    saveMutation.mutate({ contentId: id });
  };

  const handleOpenLink = () => {
    if (content?.url) {
      openUrl(content.url);
    }
  };

  if (!isSignedIn) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen
          options={{
            title: 'Content',
            headerBackTitle: 'Back',
            headerTransparent: true,
            headerBackground: () => (
              <View style={{ flex: 1, backgroundColor: 'transparent' }} />
            ),
            headerTintColor: colors.foreground,
          }}
        />
        <View style={styles.centerContent}>
          <Feather name="lock" size={64} color={colors.mutedForeground} />
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>
            Sign In Required
          </Text>
          <Text style={[styles.errorMessage, { color: colors.mutedForeground }]}>
            Please sign in to view content
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen
          options={{
            title: 'Content',
            headerBackTitle: 'Back',
            headerTransparent: true,
            headerBackground: () => (
              <View style={{ flex: 1, backgroundColor: 'transparent' }} />
            ),
            headerTintColor: colors.foreground,
          }}
        />
        <Animated.ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            {/* Skeleton Hero */}
            <View style={[styles.skeletonHero, { backgroundColor: colors.secondary }]} />

            {/* Skeleton Title */}
            <View style={[styles.skeletonTitle, { backgroundColor: colors.secondary }]} />
            <View
              style={[styles.skeletonTitleLine2, { backgroundColor: colors.secondary }]}
            />

            {/* Skeleton Creator */}
            <View style={styles.skeletonCreatorRow}>
              <View
                style={[styles.skeletonCreatorAvatar, { backgroundColor: colors.secondary }]}
              />
              <View style={styles.skeletonCreatorInfo}>
                <View
                  style={[styles.skeletonCreatorName, { backgroundColor: colors.secondary }]}
                />
                <View
                  style={[styles.skeletonCreatorDate, { backgroundColor: colors.secondary }]}
                />
              </View>
            </View>

            {/* Skeleton Buttons */}
            <View
              style={[styles.skeletonPrimaryButton, { backgroundColor: colors.secondary }]}
            />
            <View
              style={[
                styles.skeletonSecondaryButton,
                { backgroundColor: colors.secondary },
              ]}
            />
          </View>
        </Animated.ScrollView>
      </SafeAreaView>
    );
  }

  if (error || !content) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen
          options={{
            title: 'Error',
            headerBackTitle: 'Back',
            headerTransparent: true,
            headerBackground: () => (
              <View style={{ flex: 1, backgroundColor: 'transparent' }} />
            ),
            headerTintColor: colors.foreground,
          }}
        />
        <View style={styles.centerContent}>
          <Feather name="alert-circle" size={64} color={colors.destructive} />
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>
            {error ? 'Failed to load content' : 'Content not found'}
          </Text>
          <Text style={[styles.errorMessage, { color: colors.mutedForeground }]}>
            {error?.message || 'This content may no longer be available'}
          </Text>
          <TouchableOpacity
            onPress={() => refetch()}
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.buttonText, { color: colors.primaryForeground || '#fff' }]}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerTitle: '',
          headerBackTitle: 'Back',
          headerTransparent: true,
          headerBackground: () => <View style={{ flex: 1, backgroundColor: 'transparent' }} />,
          headerTintColor: colors.foreground,
        }}
      />

      <Animated.ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
      >
        <BookmarkContentDisplay
          data={content}
          scrollY={scrollY}
          onCreatorPress={(creatorId) => router.push(`/creator/${creatorId}` as any)}
          showNotes={false}
          showTags={false}
        >
          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <SaveBookmarkButton
              onPress={handleSave}
              isLoading={saveMutation.isPending}
            />
            <OpenLinkButton onPress={handleOpenLink} secondary />
          </View>
        </BookmarkContentDisplay>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 24,
  },
  primaryButton: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  actionButtons: {
    marginTop: 16,
    marginBottom: 20,
  },
  // Skeleton styles
  skeletonHero: {
    width: '100%',
    height: 300,
    borderRadius: 16,
    opacity: 0.3,
  },
  skeletonTitle: {
    width: '90%',
    height: 26,
    borderRadius: 8,
    marginTop: 20,
    opacity: 0.3,
  },
  skeletonTitleLine2: {
    width: '60%',
    height: 26,
    borderRadius: 8,
    marginTop: 8,
    opacity: 0.3,
  },
  skeletonCreatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 12,
  },
  skeletonCreatorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    opacity: 0.3,
  },
  skeletonCreatorInfo: {
    flex: 1,
    gap: 6,
  },
  skeletonCreatorName: {
    width: '50%',
    height: 16,
    borderRadius: 4,
    opacity: 0.3,
  },
  skeletonCreatorDate: {
    width: '30%',
    height: 14,
    borderRadius: 4,
    opacity: 0.3,
  },
  skeletonPrimaryButton: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    marginTop: 20,
    opacity: 0.3,
  },
  skeletonSecondaryButton: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    marginTop: 12,
    opacity: 0.3,
  },
});

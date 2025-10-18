import * as React from 'react';
import { View, ScrollView, ActivityIndicator, Text, Pressable, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/theme';
import { bookmarksApi } from '../../lib/api';
import type { Bookmark } from '@zine/shared';
import { ArticleHeader } from '../../components/ArticleHeader';
import { ArticleContent } from '../../components/ArticleContent';

export default function ArticleReaderScreen() {
  const { bookmarkId } = useLocalSearchParams<{ bookmarkId: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [bookmark, setBookmark] = React.useState<Bookmark | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Fetch bookmark details
  React.useEffect(() => {
    const fetchBookmark = async () => {
      if (!bookmarkId) {
        setError('No bookmark ID provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const data = await bookmarksApi.getById(bookmarkId);
        setBookmark(data);
      } catch (err) {
        console.error('Failed to fetch bookmark:', err);
        setError(err instanceof Error ? err.message : 'Failed to load article');
      } finally {
        setLoading(false);
      }
    };

    fetchBookmark();
  }, [bookmarkId]);

  // Loading state
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 16, color: colors.mutedForeground }}>Loading article...</Text>
      </View>
    );
  }

  // Error state
  if (error || !bookmark) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', color: colors.foreground, marginBottom: 8 }}>
          Failed to load article
        </Text>
        <Text style={{ fontSize: 14, color: colors.mutedForeground, textAlign: 'center', marginBottom: 24 }}>
          {error || 'Article not found'}
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header with back button */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 60,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.background
      }}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          hitSlop={8}
        >
          <ChevronLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.foreground, marginLeft: 12 }}>
          Article
        </Text>
      </View>

      {/* Article content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={true}
      >
        <ArticleHeader bookmark={bookmark} />
        <ArticleContent
          html={bookmark.fullTextContent}
          fallbackUrl={bookmark.url}
          bookmark={bookmark}
        />
      </ScrollView>
    </View>
  );
}

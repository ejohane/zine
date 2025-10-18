import * as React from 'react';
import { View, Text, Image } from 'react-native';
import type { Bookmark } from '@zine/shared';
import { formatPublicationDate } from '../lib/dateUtils';
import { useTheme } from '../contexts/theme';

interface ArticleHeaderProps {
  bookmark: Bookmark;
}

export function ArticleHeader({ bookmark }: ArticleHeaderProps) {
  const { colors } = useTheme();

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16 }}>
      {/* Title */}
      <Text style={{
        fontSize: 28,
        fontWeight: '700',
        lineHeight: 36,
        color: colors.foreground,
        marginBottom: 16
      }}>
        {bookmark.title}
      </Text>

      {/* Metadata section */}
      <View style={{ flexDirection: 'column', gap: 12 }}>
        {/* Author section */}
        {bookmark.creator && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {bookmark.creator.avatarUrl && (
              <Image
                source={{ uri: bookmark.creator.avatarUrl }}
                style={{ width: 40, height: 40, borderRadius: 20 }}
                onError={() => {}}
              />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{
                fontSize: 15,
                fontWeight: '600',
                color: colors.foreground
              }} numberOfLines={1}>
                {bookmark.creator.name}
              </Text>
              {bookmark.articleMetadata?.authorName && bookmark.articleMetadata.authorName !== bookmark.creator.name && (
                <Text style={{
                  fontSize: 13,
                  color: colors.mutedForeground
                }} numberOfLines={1}>
                  {bookmark.articleMetadata.authorName}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Date and Reading Time */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {bookmark.publishedAt && (
            <Text style={{ fontSize: 14, color: colors.mutedForeground }}>
              {formatPublicationDate(bookmark.publishedAt)}
            </Text>
          )}
          {bookmark.articleMetadata?.readingTime && (
            <>
              {bookmark.publishedAt && (
                <Text style={{ fontSize: 14, color: colors.mutedForeground }}>•</Text>
              )}
              <Text style={{ fontSize: 14, color: colors.mutedForeground }}>
                {bookmark.articleMetadata.readingTime} min read
              </Text>
            </>
          )}
        </View>

        {/* Paywall indicator */}
        {bookmark.articleMetadata?.isPaywalled && (
          <View style={{
            backgroundColor: 'rgba(255, 193, 7, 0.15)',
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: 'rgba(255, 193, 7, 0.4)'
          }}>
            <Text style={{ fontSize: 13, color: '#856404', fontWeight: '500' }}>
              🔒 This article may have limited preview content
            </Text>
          </View>
        )}
      </View>

      {/* Divider */}
      <View style={{
        height: 1,
        backgroundColor: colors.border,
        marginTop: 20
      }} />
    </View>
  );
}

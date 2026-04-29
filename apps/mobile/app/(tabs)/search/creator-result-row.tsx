import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SourceBadge } from '@/components/badges';
import { Surface, Text } from '@/components/primitives';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import type { CreatorSearchResult } from '@/hooks/use-search';

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function getLibraryCountText(count: number): string {
  if (count <= 0) {
    return 'Creator';
  }

  return `${count} library ${count === 1 ? 'item' : 'items'}`;
}

export const CreatorResultRow = memo(function CreatorResultRow({
  creator,
}: {
  creator: CreatorSearchResult;
}) {
  const router = useRouter();
  const { colors, motion } = useAppTheme();
  const initials = useMemo(() => getInitials(creator.name), [creator.name]);

  const handlePress = useCallback(() => {
    router.push(`/creator/${creator.creatorId}?source=search` as Href);
  }, [creator.creatorId, router]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${creator.name}, creator`}
      onPress={handlePress}
      style={({ pressed }) => [styles.pressable, pressed && { opacity: motion.opacity.pressed }]}
    >
      <Surface tone="transparent" style={styles.row}>
        <View style={[styles.avatar, { backgroundColor: colors.surfaceRaised }]}>
          {creator.imageUrl ? (
            <Image
              source={{ uri: creator.imageUrl }}
              style={styles.avatarImage}
              contentFit="cover"
            />
          ) : (
            <Text variant="labelLarge" tone="secondary" transform="none">
              {initials}
            </Text>
          )}
        </View>

        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text variant="bodyMedium" tone="primary" numberOfLines={1} style={styles.title}>
              {creator.name}
            </Text>
            {creator.isSubscribed ? (
              <Text variant="labelSmall" tone="accent" numberOfLines={1}>
                Subscribed
              </Text>
            ) : null}
          </View>

          <View style={styles.metadataRow}>
            <SourceBadge provider={creator.provider} />
            <Text variant="bodySmall" tone="tertiary" numberOfLines={1}>
              {creator.handle ?? getLibraryCountText(creator.libraryItemCount)}
            </Text>
          </View>
        </View>
      </Surface>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pressable: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    ...Typography.bodyMedium,
    flex: 1,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});

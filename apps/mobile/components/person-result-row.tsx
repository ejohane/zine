import { useRouter, type Href } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Surface, Text } from '@/components/primitives';
import { Radius, Spacing } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { getInitials } from '@/lib/person';

export type PersonResultRowData = {
  id: string;
  displayName: string;
  profileImageUrl?: string | null;
  itemCount: number;
  latestItemTitle?: string | null;
};

function getCountText(count: number): string {
  return `${count} saved ${count === 1 ? 'item' : 'items'}`;
}

export const PersonResultRow = memo(function PersonResultRow({
  person,
  source = 'library',
}: {
  person: PersonResultRowData;
  source?: 'library' | 'search';
}) {
  const router = useRouter();
  const { colors, motion } = useAppTheme();
  const initials = useMemo(() => getInitials(person.displayName), [person.displayName]);
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(person.profileImageUrl && !imageFailed);

  useEffect(() => {
    setImageFailed(false);
  }, [person.profileImageUrl]);

  const handlePress = useCallback(() => {
    router.push(`/person/${person.id}?source=${source}` as Href);
  }, [person.id, router, source]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${person.displayName}, ${getCountText(person.itemCount)}`}
      onPress={handlePress}
      style={({ pressed }) => [styles.pressable, pressed && { opacity: motion.opacity.pressed }]}
    >
      <Surface tone="transparent" style={styles.row}>
        <View style={[styles.avatar, { backgroundColor: colors.surfaceRaised }]}>
          {showImage ? (
            <Image
              source={{ uri: person.profileImageUrl! }}
              style={styles.avatarImage}
              onError={() => setImageFailed(true)}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <Text variant="labelLarge" tone="secondary" transform="none">
              {initials}
            </Text>
          )}
        </View>

        <View style={styles.content}>
          <Text variant="bodyMedium" tone="primary" numberOfLines={1}>
            {person.displayName}
          </Text>
          <Text variant="bodySmall" tone="tertiary" numberOfLines={1}>
            {getCountText(person.itemCount)}
          </Text>
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
});

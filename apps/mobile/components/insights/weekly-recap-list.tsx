import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { ItemCard } from '@/components/item-card';
import { Surface, Text } from '@/components/primitives';
import { Radius, Spacing } from '@/constants/theme';
import { mapContentType, mapProvider } from '@/hooks/use-items-trpc';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatDateTime } from '@/lib/format';
import {
  formatEstimatedMinutes,
  groupRecapItemsByDay,
  type WeeklyRecapCompletedItem,
  type WeeklyRecapStartedItem,
} from '@/lib/weekly-recap';

type WeeklyRecapListProps =
  | {
      title: string;
      variant: 'completed';
      items: WeeklyRecapCompletedItem[];
    }
  | {
      title: string;
      variant: 'started';
      items: WeeklyRecapStartedItem[];
    };

export function WeeklyRecapList(props: WeeklyRecapListProps) {
  const { colors } = useAppTheme();
  const groups = groupRecapItemsByDay(props.items);

  if (groups.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text variant="titleLarge">{props.title}</Text>
      <View style={styles.groupColumn}>
        {groups.map((group) => (
          <View key={group.dayBucket} style={styles.group}>
            <Text variant="titleSmall" tone="subheader">
              {group.dayLabel}
            </Text>
            <Surface tone="subtle" border="subtle" radius="xl" style={styles.groupSurface}>
              {group.items.map((item, index) => {
                const isLast = index === group.items.length - 1;

                return (
                  <Fragment key={item.userItemId}>
                    <View style={styles.itemRow}>
                      <ItemCard
                        item={{
                          id: item.userItemId,
                          title: item.title,
                          creator: item.creator,
                          thumbnailUrl: item.thumbnailUrl,
                          contentType: mapContentType(item.contentType),
                          provider: mapProvider(item.provider),
                          readingTimeMinutes:
                            props.variant === 'completed' ? item.estimatedMinutes : null,
                        }}
                      />
                      <View style={styles.detailRow}>
                        <Text variant="bodySmall" tone="subheader">
                          {props.variant === 'completed'
                            ? `Finished ${formatDateTime(item.finishedAt)}`
                            : `Last touched ${formatDateTime(item.lastTouchedAt)}`}
                        </Text>
                        <Text variant="bodySmall" tone="tertiary">
                          {props.variant === 'completed'
                            ? `Estimated ${formatEstimatedMinutes(item.estimatedMinutes)}`
                            : item.progressPercent !== null
                              ? `${item.progressPercent}% complete`
                              : 'Opened this week'}
                        </Text>
                      </View>
                    </View>
                    {!isLast ? (
                      <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
                    ) : null}
                  </Fragment>
                );
              })}
            </Surface>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  groupColumn: {
    gap: Spacing.lg,
  },
  group: {
    gap: Spacing.sm,
  },
  groupSurface: {
    overflow: 'hidden',
    borderRadius: Radius.xl,
  },
  itemRow: {
    paddingVertical: Spacing.sm,
  },
  detailRow: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  divider: {
    height: 1,
    marginHorizontal: Spacing.md,
  },
});

export default WeeklyRecapList;

import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/primitives/text';
import { IconSizes } from '@/constants/theme';

import { LinkedText } from '../../item-detail-components';
import { styles } from '../../item-detail-styles';
import type { ItemDetailColors } from '../types';

type ItemDetailDescriptionProps = {
  summary: string;
  label: string;
  colors: ItemDetailColors;
};

const COLLAPSED_DESCRIPTION_LINES = 4;
const EXPANDABLE_DESCRIPTION_MIN_LENGTH = 160;

export function ItemDetailDescription({ summary, label, colors }: ItemDetailDescriptionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const canExpand = summary.trim().length > EXPANDABLE_DESCRIPTION_MIN_LENGTH;
  const descriptionLines = canExpand && !isExpanded ? COLLAPSED_DESCRIPTION_LINES : undefined;

  return (
    <>
      {canExpand ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Toggle ${label}`}
          accessibilityState={{ expanded: isExpanded }}
          onPress={() => setIsExpanded((current) => !current)}
          style={({ pressed }) => [styles.descriptionHeader, pressed ? { opacity: 0.72 } : null]}
        >
          <Text variant="labelSmall" tone="tertiary" colors={colors}>
            {label}
          </Text>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={IconSizes.sm}
            color={colors.textTertiary}
          />
        </Pressable>
      ) : (
        <View style={styles.descriptionHeader}>
          <Text variant="labelSmall" tone="tertiary" colors={colors}>
            {label}
          </Text>
        </View>
      )}
      <LinkedText
        style={[styles.description, { color: colors.textSubheader }]}
        linkColor={colors.primary}
        numberOfLines={descriptionLines}
      >
        {summary}
      </LinkedText>
    </>
  );
}

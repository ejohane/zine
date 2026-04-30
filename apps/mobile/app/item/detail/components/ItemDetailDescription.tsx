import { useState } from 'react';
import { Pressable } from 'react-native';
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

export function ItemDetailDescription({ summary, label, colors }: ItemDetailDescriptionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
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
      <LinkedText
        style={[styles.description, { color: colors.textSubheader }]}
        linkColor={colors.primary}
        numberOfLines={isExpanded ? undefined : 2}
      >
        {summary}
      </LinkedText>
    </>
  );
}

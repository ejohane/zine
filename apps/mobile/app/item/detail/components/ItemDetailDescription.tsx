import { Text } from '@/components/primitives/text';

import { LinkedText } from '../../item-detail-components';
import { styles } from '../../item-detail-styles';
import type { ItemDetailColors } from '../types';

type ItemDetailDescriptionProps = {
  summary: string;
  label: string;
  colors: ItemDetailColors;
};

export function ItemDetailDescription({ summary, label, colors }: ItemDetailDescriptionProps) {
  return (
    <>
      <Text variant="labelSmall" tone="tertiary" colors={colors}>
        {label}
      </Text>
      <LinkedText
        style={[styles.description, { color: colors.textSubheader }]}
        linkColor={colors.primary}
      >
        {summary}
      </LinkedText>
    </>
  );
}

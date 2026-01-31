import { Text } from 'react-native';

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
      <Text style={[styles.descriptionLabel, { color: colors.text }]}>{label}</Text>
      <LinkedText
        style={[styles.description, { color: colors.textSecondary }]}
        linkColor={colors.primary}
      >
        {summary}
      </LinkedText>
    </>
  );
}

import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { Surface } from '@/components/primitives/surface';
import { Text } from '@/components/primitives/text';
import { IconSizes } from '@/constants/theme';

import { styles } from '../../item-detail-styles';
import type { ItemDetailColors, ItemDetailEnrichment, ItemDetailItem } from '../types';

type EnrichmentEntity = NonNullable<ItemDetailEnrichment>['item']['entities'][number];

type PersonEntity = {
  name: string;
  personId: string | null;
  confidence: number;
};

type ItemDetailPeopleCardProps = {
  enrichment?: ItemDetailEnrichment;
  item: Pick<ItemDetailItem, 'contentType'>;
  colors: ItemDetailColors;
  onPersonPress?: (personId: string) => void;
};

const MAX_VISIBLE_PEOPLE = 5;

function normalizeEntityType(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ');
}

function normalizePersonName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function getPeopleCardLabel(contentType: string): string {
  switch (contentType.toUpperCase()) {
    case 'VIDEO':
      return 'People in this video';
    case 'PODCAST':
      return 'People in this episode';
    case 'ARTICLE':
      return 'People in this article';
    case 'POST':
      return 'People in this post';
    default:
      return 'People in this item';
  }
}

function toPeople(entities: EnrichmentEntity[]): PersonEntity[] {
  const peopleByName = new Map<string, PersonEntity>();

  for (const entity of entities) {
    if (normalizeEntityType(entity.type) !== 'person') {
      continue;
    }

    const name = entity.name.replace(/\s+/g, ' ').trim();
    const normalizedName = normalizePersonName(name);
    if (!name || !normalizedName) {
      continue;
    }

    const existing = peopleByName.get(normalizedName);
    const next = {
      name,
      personId: entity.personId ?? null,
      confidence: entity.confidence,
    };

    if (
      !existing ||
      (!existing.personId && next.personId) ||
      next.confidence > existing.confidence
    ) {
      peopleByName.set(normalizedName, next);
    }
  }

  return [...peopleByName.values()]
    .sort(
      (a, b) =>
        Number(Boolean(b.personId)) - Number(Boolean(a.personId)) || b.confidence - a.confidence
    )
    .slice(0, MAX_VISIBLE_PEOPLE);
}

function PersonRow({
  person,
  colors,
  onPersonPress,
}: {
  person: PersonEntity;
  colors: ItemDetailColors;
  onPersonPress?: (personId: string) => void;
}) {
  const initials = getInitials(person.name);
  const personId = person.personId;
  const isNavigable = Boolean(personId && onPersonPress);
  const content = (
    <>
      <View style={[styles.peopleAvatar, { backgroundColor: colors.backgroundTertiary }]}>
        <Text variant="labelSmall" tone="tertiary" colors={colors} transform="none">
          {initials}
        </Text>
      </View>
      <Text
        variant="bodyMedium"
        tone="primary"
        colors={colors}
        transform="none"
        numberOfLines={1}
        style={styles.peopleName}
      >
        {person.name}
      </Text>
      {isNavigable ? (
        <Ionicons name="chevron-forward" size={IconSizes.sm} color={colors.textTertiary} />
      ) : null}
    </>
  );

  if (!isNavigable || !personId || !onPersonPress) {
    return <View style={styles.peopleRow}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${person.name}`}
      onPress={() => onPersonPress(personId)}
      style={({ pressed }) => [styles.peopleRow, pressed ? { opacity: 0.72 } : null]}
    >
      {content}
    </Pressable>
  );
}

export function ItemDetailPeopleCard({
  enrichment,
  item,
  colors,
  onPersonPress,
}: ItemDetailPeopleCardProps) {
  const people = enrichment ? toPeople(enrichment.item.entities) : [];

  if (people.length === 0) {
    return null;
  }

  return (
    <View style={styles.peopleContainer}>
      <Surface
        tone="subtle"
        radius="lg"
        colors={colors}
        style={styles.peopleSurface}
        accessibilityLabel={getPeopleCardLabel(item.contentType)}
      >
        <View style={styles.peopleHeader}>
          <Text variant="labelSmall" tone="tertiary" colors={colors}>
            {getPeopleCardLabel(item.contentType)}
          </Text>
        </View>

        <View style={styles.peopleList}>
          {people.map((person) => (
            <PersonRow
              key={normalizePersonName(person.name)}
              person={person}
              colors={colors}
              onPersonPress={onPersonPress}
            />
          ))}
        </View>
      </Surface>
    </View>
  );
}

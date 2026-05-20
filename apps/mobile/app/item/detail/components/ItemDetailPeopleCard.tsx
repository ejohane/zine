import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { Surface } from '@/components/primitives/surface';
import { Text } from '@/components/primitives/text';
import { IconSizes } from '@/constants/theme';

import { styles } from '../../item-detail-styles';
import type { ItemDetailColors, ItemDetailEnrichment, ItemDetailItem } from '../types';

type EnrichmentEntity = NonNullable<ItemDetailEnrichment>['item']['entities'][number];

type PersonEntity = {
  name: string;
  personId: string | null;
  profileImageUrl: string | null;
  xHandle: string | null;
  relationship: string;
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

function formatRelationship(value: string | null | undefined): string | null {
  if (!value || value === 'MENTIONED') {
    return null;
  }

  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function relationshipPriority(value: string | null | undefined): number {
  switch (value) {
    case 'HOST':
    case 'CO_HOST':
    case 'OWNER':
    case 'CREATOR':
      return 4;
    case 'AUTHOR':
    case 'INTERVIEWER':
    case 'INTERVIEWEE':
    case 'GUEST':
      return 3;
    case 'PRIMARY_SUBJECT':
      return 2;
    default:
      return 1;
  }
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function formatXHandle(value: string | null): string | null {
  if (!value) return null;
  const handle = value.trim().replace(/^@/, '');
  return handle ? `@${handle}` : null;
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
    const next: PersonEntity = {
      name,
      personId: entity.personId ?? null,
      profileImageUrl: entity.profileImageUrl ?? null,
      xHandle: entity.xHandle ?? null,
      relationship: entity.relationship ?? 'MENTIONED',
      confidence: entity.confidence,
    };
    const candidate = existing
      ? {
          ...next,
          personId: next.personId ?? existing.personId,
          profileImageUrl: next.profileImageUrl ?? existing.profileImageUrl,
          xHandle: next.xHandle ?? existing.xHandle,
        }
      : next;

    if (
      !existing ||
      (!existing.personId && candidate.personId) ||
      (!existing.profileImageUrl && candidate.profileImageUrl) ||
      (!existing.xHandle && candidate.xHandle) ||
      relationshipPriority(candidate.relationship) > relationshipPriority(existing.relationship) ||
      (candidate.relationship === existing.relationship &&
        candidate.confidence > existing.confidence)
    ) {
      peopleByName.set(normalizedName, candidate);
    }
  }

  return [...peopleByName.values()]
    .sort(
      (a, b) =>
        Number(Boolean(b.personId)) - Number(Boolean(a.personId)) ||
        relationshipPriority(b.relationship) - relationshipPriority(a.relationship) ||
        b.confidence - a.confidence
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
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(person.profileImageUrl && !imageFailed);
  const isNavigable = Boolean(personId && onPersonPress);
  const relationship = formatRelationship(person.relationship);
  const label = relationship ? `${person.name} / ${relationship}` : person.name;
  const xHandle = formatXHandle(person.xHandle);

  useEffect(() => {
    setImageFailed(false);
  }, [person.profileImageUrl]);

  const content = (
    <>
      <View style={[styles.peopleAvatar, { backgroundColor: colors.backgroundTertiary }]}>
        {showImage ? (
          <Image
            source={{ uri: person.profileImageUrl! }}
            style={styles.peopleAvatarImage}
            onError={() => setImageFailed(true)}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text variant="labelSmall" tone="tertiary" colors={colors} transform="none">
            {initials}
          </Text>
        )}
      </View>
      <View style={styles.peopleTextStack}>
        <Text
          variant="bodyMedium"
          tone="primary"
          colors={colors}
          transform="none"
          numberOfLines={1}
          style={styles.peopleName}
        >
          {label}
        </Text>
        {xHandle ? (
          <Text variant="labelSmall" tone="tertiary" colors={colors} transform="none">
            {xHandle}
          </Text>
        ) : null}
      </View>
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

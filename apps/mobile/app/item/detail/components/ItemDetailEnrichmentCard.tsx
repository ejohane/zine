import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Badge } from '@/components/primitives/badge';
import { Surface } from '@/components/primitives/surface';
import { Text } from '@/components/primitives/text';

import { styles } from '../../item-detail-styles';
import type { ItemDetailColors, ItemDetailEnrichment } from '../types';

type ItemDetailEnrichmentCardProps = {
  enrichment?: ItemDetailEnrichment;
  isLoading?: boolean;
  error?: unknown;
  colors: ItemDetailColors;
};

type EnrichmentTopic = NonNullable<ItemDetailEnrichment>['item']['topics'][number];
type EnrichmentEntity = NonNullable<ItemDetailEnrichment>['item']['entities'][number];
type SuggestedTag = NonNullable<ItemDetailEnrichment>['userItem']['suggestedTags'][number];

function formatLabel(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPercent(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }

  return `${Math.round(value * 100)}%`;
}

function hasEnrichmentContent(
  enrichment?: ItemDetailEnrichment
): enrichment is NonNullable<ItemDetailEnrichment> {
  if (!enrichment) return false;

  const { item, userItem } = enrichment;

  return Boolean(
    item.summaryShort ||
    item.primaryCategory ||
    item.intent ||
    item.difficulty ||
    item.evergreenScore !== null ||
    item.timeSensitivity ||
    item.topics.length > 0 ||
    item.entities.length > 0 ||
    userItem.reasonToRevisit ||
    userItem.suggestedTags.length > 0
  );
}

function EnrichmentField({
  label,
  value,
  colors,
}: {
  label: string;
  value?: string | null;
  colors: ItemDetailColors;
}) {
  if (!value) return null;

  return (
    <View style={styles.enrichmentField}>
      <Text variant="labelSmall" tone="tertiary" colors={colors}>
        {label}
      </Text>
      <Text variant="bodyMedium" tone="subheader" colors={colors}>
        {value}
      </Text>
    </View>
  );
}

function ChipGroup({
  label,
  children,
  colors,
}: {
  label: string;
  children: ReactNode;
  colors: ItemDetailColors;
}) {
  return (
    <View style={styles.enrichmentField}>
      <Text variant="labelSmall" tone="tertiary" colors={colors}>
        {label}
      </Text>
      <View style={styles.enrichmentChipWrap}>{children}</View>
    </View>
  );
}

function renderSuggestedTag(tag: SuggestedTag, colors: ItemDetailColors) {
  const confidence = formatPercent(tag.confidence);
  const label = confidence ? `${tag.name} ${confidence}` : tag.name;

  return (
    <Badge
      key={`${tag.normalizedName}-${tag.kind}`}
      label={label}
      tone="subtle"
      colors={colors}
      style={styles.enrichmentChip}
    />
  );
}

function renderTopic(topic: EnrichmentTopic, colors: ItemDetailColors) {
  const confidence = formatPercent(topic.confidence);
  const label = confidence ? `${topic.name} ${confidence}` : topic.name;

  return (
    <Badge
      key={topic.name}
      label={label}
      tone="subtle"
      colors={colors}
      style={styles.enrichmentChip}
    />
  );
}

function renderEntity(entity: EnrichmentEntity, colors: ItemDetailColors) {
  const confidence = formatPercent(entity.confidence);
  const label = [entity.name, formatLabel(entity.type), confidence].filter(Boolean).join(' / ');

  return (
    <Badge
      key={`${entity.name}-${entity.type}`}
      label={label}
      tone="subtle"
      colors={colors}
      style={styles.enrichmentChip}
    />
  );
}

export function ItemDetailEnrichmentCard({
  enrichment,
  isLoading = false,
  error,
  colors,
}: ItemDetailEnrichmentCardProps) {
  if (isLoading) {
    return (
      <View style={styles.enrichmentContainer}>
        <Surface
          tone="subtle"
          radius="lg"
          padding="lg"
          colors={colors}
          style={styles.enrichmentSurface}
        >
          <Text variant="labelSmall" tone="tertiary" colors={colors}>
            ENRICHMENT
          </Text>
          <Text variant="bodyMedium" tone="secondary" colors={colors}>
            Loading enrichment...
          </Text>
        </Surface>
      </View>
    );
  }

  if (error || !hasEnrichmentContent(enrichment)) {
    return null;
  }

  const { item, userItem } = enrichment;
  const evergreenScore = formatPercent(item.evergreenScore);

  return (
    <View style={styles.enrichmentContainer}>
      <Surface
        tone="subtle"
        radius="lg"
        padding="lg"
        colors={colors}
        style={styles.enrichmentSurface}
      >
        <View style={styles.enrichmentHeader}>
          <Text variant="labelSmall" tone="tertiary" colors={colors}>
            ENRICHMENT
          </Text>
          {item.primaryCategory && (
            <Badge label={formatLabel(item.primaryCategory)} tone="neutral" colors={colors} />
          )}
        </View>

        <EnrichmentField label="Short Summary" value={item.summaryShort} colors={colors} />
        <EnrichmentField
          label="Reason To Revisit"
          value={userItem.reasonToRevisit}
          colors={colors}
        />

        {userItem.suggestedTags.length > 0 && (
          <ChipGroup label="Suggested Tags" colors={colors}>
            {userItem.suggestedTags.map((tag) => renderSuggestedTag(tag, colors))}
          </ChipGroup>
        )}

        {item.topics.length > 0 && (
          <ChipGroup label="Topics" colors={colors}>
            {item.topics.map((topic) => renderTopic(topic, colors))}
          </ChipGroup>
        )}

        <View style={styles.enrichmentGrid}>
          <EnrichmentField
            label="Primary Category"
            value={item.primaryCategory ? formatLabel(item.primaryCategory) : null}
            colors={colors}
          />
          <EnrichmentField
            label="Intent"
            value={item.intent ? formatLabel(item.intent) : null}
            colors={colors}
          />
          <EnrichmentField
            label="Difficulty"
            value={item.difficulty ? formatLabel(item.difficulty) : null}
            colors={colors}
          />
          <EnrichmentField label="Evergreen Score" value={evergreenScore} colors={colors} />
          <EnrichmentField
            label="Time Sensitivity"
            value={item.timeSensitivity ? formatLabel(item.timeSensitivity) : null}
            colors={colors}
          />
        </View>

        {item.entities.length > 0 && (
          <ChipGroup label="Entities" colors={colors}>
            {item.entities.map((entity) => renderEntity(entity, colors))}
          </ChipGroup>
        )}
      </Surface>
    </View>
  );
}

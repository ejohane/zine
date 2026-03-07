import type { Meta, StoryObj } from '@storybook/react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SearchIcon } from '@/components/icons';
import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import {
  Colors,
  ContentColors,
  Fonts,
  IconSizes,
  Motion,
  ProviderColors,
  Radius,
  Shadows,
  Spacing,
  Typography,
} from '@/constants/theme';

type TokenCardData = {
  name: string;
  value: string;
  note: string;
};

type ColorSection = {
  title: string;
  description: string;
  items: TokenCardData[];
};

const colorSections: ColorSection[] = [
  {
    title: 'Text roles',
    description: 'Hierarchy should come from contrast and typography before decoration.',
    items: [
      {
        name: 'textPrimary',
        value: Colors.dark.textPrimary,
        note: 'Default reading copy and high-emphasis labels.',
      },
      {
        name: 'textSecondary',
        value: Colors.dark.textSecondary,
        note: 'Metadata, supporting labels, and secondary actions.',
      },
      {
        name: 'textTertiary',
        value: Colors.dark.textTertiary,
        note: 'Quiet chrome and low-priority timestamps.',
      },
      {
        name: 'textInverse',
        value: Colors.dark.textInverse,
        note: 'Text on accent fills and inverted controls.',
      },
    ],
  },
  {
    title: 'Surface roles',
    description: 'Use semantic layers before inventing new fills.',
    items: [
      {
        name: 'surfaceCanvas',
        value: Colors.dark.surfaceCanvas,
        note: 'Screen background and empty canvas.',
      },
      {
        name: 'surfaceSubtle',
        value: Colors.dark.surfaceSubtle,
        note: 'Quiet chips, grouped rows, and low-emphasis containers.',
      },
      {
        name: 'surfaceElevated',
        value: Colors.dark.surfaceElevated,
        note: 'Cards and primary interactive modules.',
      },
      {
        name: 'surfaceRaised',
        value: Colors.dark.surfaceRaised,
        note: 'Pressed, highlighted, and stronger separation states.',
      },
    ],
  },
  {
    title: 'Action, border, and state',
    description: 'Accent stays sparse. Status color should clarify state, not dominate the screen.',
    items: [
      {
        name: 'accent',
        value: Colors.dark.accent,
        note: 'Primary call to action and selected emphasis.',
      },
      {
        name: 'borderDefault',
        value: Colors.dark.borderDefault,
        note: 'Default divider and card edge treatment.',
      },
      {
        name: 'statusSuccess',
        value: Colors.dark.statusSuccess,
        note: 'Success confirmations and healthy states.',
      },
      {
        name: 'statusError',
        value: Colors.dark.statusError,
        note: 'Blocking problems and destructive feedback.',
      },
    ],
  },
  {
    title: 'Metadata color',
    description:
      'Provider and content colors are for wayfinding, not as dominant screen backgrounds.',
    items: [
      {
        name: 'Content.article',
        value: ContentColors.article,
        note: 'Article and long-form reading metadata.',
      },
      {
        name: 'Content.video',
        value: ContentColors.video,
        note: 'Video wayfinding in mixed feeds.',
      },
      {
        name: 'Provider.substack',
        value: ProviderColors.substack,
        note: 'Publisher/source label only.',
      },
      {
        name: 'Provider.gmail',
        value: ProviderColors.gmail,
        note: 'Rare exception when a provider needs distinct identity.',
      },
    ],
  },
];

const typographyEntries = [
  {
    name: 'displayLarge',
    sample: 'Read what matters.',
    note: 'Hero moments only.',
    style: Typography.displayLarge,
  },
  {
    name: 'displayMedium',
    sample: 'Focused reading, not noise.',
    note: 'Large section intros.',
    style: Typography.displayMedium,
  },
  {
    name: 'headlineLarge',
    sample: 'Editorial hierarchy with restraint',
    note: 'Primary section headers.',
    style: Typography.headlineLarge,
  },
  {
    name: 'headlineMedium',
    sample: 'High-value callouts',
    note: 'Card group headings.',
    style: Typography.headlineMedium,
  },
  {
    name: 'headlineSmall',
    sample: 'Dense, clear grouping',
    note: 'Compact surface titles.',
    style: Typography.headlineSmall,
  },
  {
    name: 'titleLarge',
    sample: 'Item title and creator',
    note: 'High-signal rows and cards.',
    style: Typography.titleLarge,
  },
  {
    name: 'titleMedium',
    sample: 'Subhead with calm contrast',
    note: 'Secondary headers.',
    style: Typography.titleMedium,
  },
  {
    name: 'bodyLarge',
    sample: 'Long-form copy should stay readable and quiet.',
    note: 'Paragraphs in prominent contexts.',
    style: Typography.bodyLarge,
  },
  {
    name: 'bodyMedium',
    sample: 'Default supporting copy and metadata explanation.',
    note: 'Standard body copy.',
    style: Typography.bodyMedium,
  },
  {
    name: 'bodySmall',
    sample: 'Quiet support text that still needs to stay legible.',
    note: 'Secondary helper text.',
    style: Typography.bodySmall,
  },
  {
    name: 'labelLarge',
    sample: 'Primary action',
    note: 'Buttons and stronger control labels.',
    style: Typography.labelLarge,
  },
  {
    name: 'labelMedium',
    sample: 'Secondary action',
    note: 'Compact controls.',
    style: Typography.labelMedium,
  },
  {
    name: 'labelSmall',
    sample: 'SOURCE STATUS',
    note: 'Eyebrows and small metadata labels.',
    style: Typography.labelSmall,
  },
];

const spacingEntries = Object.entries(Spacing);
const radiusEntries = Object.entries(Radius);
const iconEntries = Object.entries(IconSizes);

const meta = {
  title: 'Foundations/Tokens',
  component: View,
  decorators: [createDarkCanvasDecorator({ padding: Spacing.xl })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
    notes:
      'Visual reference for semantic color roles, typography, spacing, radius, motion, and icon sizing. Source of truth remains apps/mobile/constants/theme.ts and docs/mobile/design-system/foundations.md.',
  },
} satisfies Meta<typeof View>;

export default meta;

type Story = StoryObj<typeof meta>;

function StoryHeader({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <View style={styles.hero}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.heroTitle}>{title}</Text>
      <Text style={styles.heroBody}>{body}</Text>
    </View>
  );
}

function SectionHeader({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{body}</Text>
    </View>
  );
}

function TokenCard({ name, value, note }: TokenCardData) {
  return (
    <View style={styles.tokenCard}>
      <View style={[styles.swatch, { backgroundColor: value }]} />
      <View style={styles.tokenCopy}>
        <Text style={styles.tokenName}>{name}</Text>
        <Text style={styles.tokenValue}>{value}</Text>
        <Text style={styles.tokenNote}>{note}</Text>
      </View>
    </View>
  );
}

export const ColorRoles: Story = {
  render: () => (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <StoryHeader
        eyebrow="Foundations"
        title="Semantic tokens define the UI before components do."
        body="Dark-first layering, restrained monochrome contrast, and sparse metadata color give the system its baseline rhythm."
      />
      {colorSections.map((section) => (
        <View key={section.title} style={styles.section}>
          <SectionHeader title={section.title} body={section.description} />
          <View style={styles.cardGrid}>
            {section.items.map((item) => (
              <TokenCard key={item.name} {...item} />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  ),
};

export const TypographyScale: Story = {
  render: () => (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <StoryHeader
        eyebrow="Typography"
        title="Type carries most of the hierarchy."
        body="The scale is compact, serious, and tuned for reading. Larger styles are rare; most screens should live in title, body, and label roles."
      />
      <View style={styles.stack}>
        {typographyEntries.map((entry) => (
          <View key={entry.name} style={styles.typeCard}>
            <View style={styles.typeMetaRow}>
              <Text style={styles.typeName}>{entry.name}</Text>
              <Text style={styles.typeSpecs}>
                {entry.style.fontSize}/{entry.style.lineHeight} • {entry.style.fontWeight}
              </Text>
            </View>
            <Text style={[styles.typeSample, entry.style]}>{entry.sample}</Text>
            <Text style={styles.typeNote}>{entry.note}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  ),
};

export const LayoutMetrics: Story = {
  render: () => (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <StoryHeader
        eyebrow="Metrics"
        title="Spacing and corner language make components feel related."
        body="Most of the system feel comes from repeated gaps, consistent radii, and subtle surface separation rather than visual effects."
      />
      <View style={styles.section}>
        <SectionHeader
          title="Spacing scale"
          body="Use the 4px rhythm. Prefer these tokens over one-off paddings or inter-element gaps."
        />
        <View style={styles.metricPanel}>
          {spacingEntries.map(([name, value]) => (
            <View key={name} style={styles.metricRow}>
              <Text style={styles.metricLabel}>{name}</Text>
              <View style={styles.metricRail}>
                <View style={[styles.metricBar, { width: Math.max(value * 6, 18) }]} />
              </View>
              <Text style={styles.metricValue}>{value}px</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.section}>
        <SectionHeader
          title="Radius scale"
          body="Rounded corners should read as a consistent family, not as decoration."
        />
        <View style={styles.cardGrid}>
          {radiusEntries.map(([name, value]) => (
            <View key={name} style={styles.radiusCard}>
              <View style={[styles.radiusPreview, { borderRadius: value }]} />
              <Text style={styles.tokenName}>{name}</Text>
              <Text style={styles.tokenValue}>
                {typeof value === 'number' ? `${value}px` : String(value)}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.section}>
        <SectionHeader
          title="Shadow tokens"
          body="Shadow exists, but in dark mode separation should still come primarily from surface contrast."
        />
        <View style={styles.stack}>
          {Object.entries(Shadows).map(([name, shadow]) => (
            <View key={name} style={styles.shadowCard}>
              <Text style={styles.typeName}>{name}</Text>
              <Text style={styles.shadowSpecs}>
                elevation {shadow.elevation} • radius {shadow.shadowRadius} • opacity{' '}
                {shadow.shadowOpacity}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  ),
};

export const MotionAndIconSizes: Story = {
  render: () => (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <StoryHeader
        eyebrow="Motion"
        title="Interaction feedback should be tactile, not theatrical."
        body="Fast opacity feedback and subtle scale changes are the default. Motion only earns its keep when it clarifies state."
      />
      <View style={styles.section}>
        <SectionHeader
          title="Motion tokens"
          body="These values cover most shared mobile interactions. New motion should usually extend this set rather than bypass it."
        />
        <View style={styles.cardGrid}>
          <View style={styles.specCard}>
            <Text style={styles.specTitle}>Duration</Text>
            <Text style={styles.specLine}>fast: {Motion.duration.fast}ms</Text>
            <Text style={styles.specLine}>normal: {Motion.duration.normal}ms</Text>
            <Text style={styles.specLine}>slow: {Motion.duration.slow}ms</Text>
          </View>
          <View style={styles.specCard}>
            <Text style={styles.specTitle}>Opacity</Text>
            <Text style={styles.specLine}>pressed: {Motion.opacity.pressed}</Text>
            <Text style={styles.specLine}>subdued: {Motion.opacity.subdued}</Text>
          </View>
          <View style={styles.specCard}>
            <Text style={styles.specTitle}>Scale</Text>
            <Text style={styles.specLine}>pressed: {Motion.scale.pressed}</Text>
            <Text style={styles.specLine}>subtle: {Motion.scale.subtle}</Text>
          </View>
        </View>
      </View>
      <View style={styles.section}>
        <SectionHeader
          title="Icon sizes"
          body="Icons should match the same density rules as text. Choose the token that fits the control, not the other way around."
        />
        <View style={styles.cardGrid}>
          {iconEntries.map(([name, value]) => (
            <View key={name} style={styles.iconCard}>
              <View style={styles.iconPreview}>
                <SearchIcon color={Colors.dark.textPrimary} size={value} />
              </View>
              <Text style={styles.tokenName}>{name}</Text>
              <Text style={styles.tokenValue}>{value}px</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  ),
};

const styles = StyleSheet.create({
  page: {
    gap: Spacing.xl,
    paddingBottom: Spacing['5xl'],
  },
  stack: {
    gap: Spacing.sm,
  },
  hero: {
    gap: Spacing.sm,
    padding: Spacing.xl,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    backgroundColor: Colors.dark.surfaceElevated,
  },
  eyebrow: {
    ...Typography.labelSmall,
    color: Colors.dark.textSecondary,
  },
  heroTitle: {
    ...Typography.headlineLarge,
    color: Colors.dark.textPrimary,
    fontFamily: Fonts.serif,
  },
  heroBody: {
    ...Typography.bodyMedium,
    color: Colors.dark.textSecondary,
    maxWidth: 520,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionHeader: {
    gap: Spacing.xs,
  },
  sectionTitle: {
    ...Typography.titleLarge,
    color: Colors.dark.textPrimary,
  },
  sectionBody: {
    ...Typography.bodySmall,
    color: Colors.dark.textSecondary,
    maxWidth: 520,
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tokenCard: {
    width: '48%',
    minWidth: 160,
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    backgroundColor: Colors.dark.surfaceSubtle,
  },
  swatch: {
    height: 56,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.dark.borderDefault,
  },
  tokenCopy: {
    gap: Spacing.xs,
  },
  tokenName: {
    ...Typography.labelMedium,
    color: Colors.dark.textPrimary,
  },
  tokenValue: {
    ...Typography.labelSmallPlain,
    color: Colors.dark.textTertiary,
    fontFamily: Fonts.mono,
  },
  tokenNote: {
    ...Typography.bodySmall,
    color: Colors.dark.textSecondary,
  },
  typeCard: {
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    backgroundColor: Colors.dark.surfaceElevated,
  },
  typeMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  typeName: {
    ...Typography.labelMedium,
    color: Colors.dark.textPrimary,
  },
  typeSpecs: {
    ...Typography.labelSmallPlain,
    color: Colors.dark.textSecondary,
    fontFamily: Fonts.mono,
  },
  typeSample: {
    color: Colors.dark.textPrimary,
  },
  typeNote: {
    ...Typography.bodySmall,
    color: Colors.dark.textSecondary,
  },
  metricPanel: {
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    backgroundColor: Colors.dark.surfaceElevated,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  metricLabel: {
    ...Typography.labelMedium,
    color: Colors.dark.textPrimary,
    width: 38,
  },
  metricRail: {
    flex: 1,
    height: 12,
    borderRadius: Radius.full,
    backgroundColor: Colors.dark.surfaceSubtle,
    overflow: 'hidden',
  },
  metricBar: {
    height: '100%',
    borderRadius: Radius.full,
    backgroundColor: Colors.dark.accent,
  },
  metricValue: {
    ...Typography.labelSmallPlain,
    color: Colors.dark.textSecondary,
    fontFamily: Fonts.mono,
    width: 44,
    textAlign: 'right',
  },
  radiusCard: {
    width: '31%',
    minWidth: 108,
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    backgroundColor: Colors.dark.surfaceSubtle,
    alignItems: 'center',
  },
  radiusPreview: {
    width: 72,
    height: 72,
    borderWidth: 1,
    borderColor: Colors.dark.borderDefault,
    backgroundColor: Colors.dark.surfaceRaised,
  },
  shadowCard: {
    gap: Spacing.xs,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    backgroundColor: Colors.dark.surfaceSubtle,
  },
  shadowSpecs: {
    ...Typography.bodySmall,
    color: Colors.dark.textSecondary,
    fontFamily: Fonts.mono,
  },
  specCard: {
    width: '48%',
    minWidth: 160,
    gap: Spacing.xs,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    backgroundColor: Colors.dark.surfaceSubtle,
  },
  specTitle: {
    ...Typography.labelMedium,
    color: Colors.dark.textPrimary,
  },
  specLine: {
    ...Typography.bodySmall,
    color: Colors.dark.textSecondary,
    fontFamily: Fonts.mono,
  },
  iconCard: {
    width: '31%',
    minWidth: 108,
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    backgroundColor: Colors.dark.surfaceSubtle,
    alignItems: 'center',
  },
  iconPreview: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
    backgroundColor: Colors.dark.surfaceRaised,
  },
});

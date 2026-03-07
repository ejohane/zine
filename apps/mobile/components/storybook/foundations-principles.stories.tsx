import type { Meta, StoryObj } from '@storybook/react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { Colors, Fonts, Radius, Spacing, Typography } from '@/constants/theme';

const productCharacter = ['Calm', 'Dense', 'Editorial', 'Dark-first', 'Restrained motion'];

const principles = [
  {
    index: '01',
    title: 'Content leads',
    body: 'Title, creator, status, and primary action should read in that order. If styling competes with readability, remove the styling.',
  },
  {
    index: '02',
    title: 'Hierarchy comes from contrast, not noise',
    body: 'Use a small number of emphasis tools: surface contrast, typography steps, spacing rhythm, and iconography only when it reduces scan time.',
  },
  {
    index: '03',
    title: 'Dark-first means intentional surfaces',
    body: 'Screens should feel layered rather than flat. Start from semantic surface tokens before creating any new fills.',
  },
  {
    index: '04',
    title: 'Monochrome by default',
    body: 'Provider and content colors are metadata and wayfinding, not the dominant voice of a screen.',
  },
  {
    index: '05',
    title: 'Motion should clarify state',
    body: 'Feedback should answer what changed, what is tappable, or what is loading. Decorative motion has no place in foundational UI.',
  },
  {
    index: '06',
    title: 'Components should feel related',
    body: 'Shared UI should repeat the same corner language, spacing rhythm, and text roles so screens feel coherent at a glance.',
  },
];

const preferredPatterns = [
  'Strong title readability over image flourish',
  'Rounded corners used consistently, not as decoration',
  'Compact controls with clear tap affordance',
  'Muted metadata rows that stay legible at a glance',
  'Single strong call to action per surface',
  'Empty and error states that sound clear and direct',
];

const antiPatterns = [
  'Bright accent colors used as a default background',
  'Multiple colored badges competing in the same row',
  'Glossy gradients or generic glassmorphism',
  'Hero treatments that reduce content density without earning it',
  'Stacked shadows, borders, and motion on the same component',
  'Ad hoc typography sizes added directly in shared components',
];

const reviewQuestions = [
  'Is the content still the focal point?',
  'Does this use existing semantic surfaces and text roles?',
  'Is the styling reusable, or is it a one-off?',
  'Would this still look coherent beside ItemCard, FilterChip, and ListStates?',
  'Is motion doing work, or just adding activity?',
];

const meta = {
  title: 'Foundations/Principles',
  component: View,
  decorators: [createDarkCanvasDecorator({ padding: Spacing.xl })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
    notes:
      'Visual north star for shared mobile UI. Derived from docs/mobile/design-system/principles.md and intended to guide design decisions before component implementation.',
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

export const NorthStar: Story = {
  render: () => (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <StoryHeader
        eyebrow="Design Principles"
        title="Calm, dark-first, editorial utility."
        body="These principles define product taste for the mobile app. Shared UI should feel confident and cohesive before it feels expressive."
      />
      <View style={styles.characterCard}>
        <SectionHeader
          title="Product character"
          body="This is the five-word gut check for shared mobile UI."
        />
        <View style={styles.pillRow}>
          {productCharacter.map((item) => (
            <View key={item} style={styles.characterPill}>
              <Text style={styles.characterPillText}>{item}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.stack}>
        {principles.map((principle) => (
          <View key={principle.index} style={styles.principleCard}>
            <View style={styles.principleHeader}>
              <Text style={styles.principleIndex}>{principle.index}</Text>
              <Text style={styles.principleTitle}>{principle.title}</Text>
            </View>
            <Text style={styles.principleBody}>{principle.body}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  ),
};

export const ReviewChecklist: Story = {
  render: () => (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <StoryHeader
        eyebrow="Review"
        title="Use this before shipping shared mobile UI."
        body="The checklist should be strict enough to catch drift, but small enough that people actually use it during implementation and review."
      />
      <View style={styles.section}>
        <SectionHeader
          title="Prefer"
          body="These patterns are consistent with the current system direction."
        />
        <View style={styles.listCard}>
          {preferredPatterns.map((item) => (
            <View key={item} style={styles.listRow}>
              <View style={[styles.listDot, styles.preferDot]} />
              <Text style={styles.listText}>{item}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.section}>
        <SectionHeader
          title="Avoid"
          body="These are common ways the system gets noisier or less reusable."
        />
        <View style={styles.listCard}>
          {antiPatterns.map((item) => (
            <View key={item} style={styles.listRow}>
              <View style={[styles.listDot, styles.avoidDot]} />
              <Text style={styles.listText}>{item}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.section}>
        <SectionHeader
          title="Design review questions"
          body="If the answer is unclear, the design probably needs another pass."
        />
        <View style={styles.stack}>
          {reviewQuestions.map((question, index) => (
            <View key={question} style={styles.questionCard}>
              <Text style={styles.questionIndex}>0{index + 1}</Text>
              <Text style={styles.questionText}>{question}</Text>
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
  section: {
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
    ...Typography.displayMedium,
    color: Colors.dark.textPrimary,
    fontFamily: Fonts.serif,
  },
  heroBody: {
    ...Typography.bodyMedium,
    color: Colors.dark.textSecondary,
    maxWidth: 520,
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
  characterCard: {
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    backgroundColor: Colors.dark.surfaceSubtle,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  characterPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.dark.surfaceRaised,
  },
  characterPillText: {
    ...Typography.labelMedium,
    color: Colors.dark.textPrimary,
  },
  principleCard: {
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    backgroundColor: Colors.dark.surfaceElevated,
  },
  principleHeader: {
    gap: Spacing.xs,
  },
  principleIndex: {
    ...Typography.labelSmall,
    color: Colors.dark.textTertiary,
  },
  principleTitle: {
    ...Typography.headlineSmall,
    color: Colors.dark.textPrimary,
  },
  principleBody: {
    ...Typography.bodyMedium,
    color: Colors.dark.textSecondary,
  },
  listCard: {
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    backgroundColor: Colors.dark.surfaceElevated,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  listDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    marginTop: 6,
  },
  preferDot: {
    backgroundColor: Colors.dark.statusSuccess,
  },
  avoidDot: {
    backgroundColor: Colors.dark.statusError,
  },
  listText: {
    ...Typography.bodyMedium,
    color: Colors.dark.textSecondary,
    flex: 1,
  },
  questionCard: {
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    backgroundColor: Colors.dark.surfaceSubtle,
  },
  questionIndex: {
    ...Typography.labelSmall,
    color: Colors.dark.textTertiary,
  },
  questionText: {
    ...Typography.titleMedium,
    color: Colors.dark.textPrimary,
  },
});

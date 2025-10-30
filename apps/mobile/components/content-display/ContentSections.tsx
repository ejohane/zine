import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/theme';
import { LinkifiedText } from '../LinkifiedText';

interface ContentSectionsProps {
  tags?: string[];
  notes?: string;
  description?: string;
  showTags?: boolean;
  showNotes?: boolean;
}

export function ContentSections({
  tags,
  notes,
  description,
  showTags = true,
  showNotes = true,
}: ContentSectionsProps) {
  const { colors } = useTheme();

  return (
    <>
      {/* Tags */}
      {showTags && tags && tags.length > 0 && (
        <View style={styles.tagsSection}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Tags</Text>
          <View style={styles.tagsContainer}>
            {tags.map((tag, index) => (
              <View key={index} style={[styles.tag, { backgroundColor: colors.primary + '20' }]}>
                <Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Notes */}
      {showNotes && notes && (
        <View style={styles.notesSection}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Notes</Text>
          <View style={[styles.notesCard, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.notesText, { color: colors.foreground }]}>{notes}</Text>
          </View>
        </View>
      )}

      {/* Description */}
      {description && (
        <LinkifiedText 
          text={description}
          style={[styles.description, { color: colors.mutedForeground }]}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  tagsSection: {
    marginBottom: 20,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tagText: {
    fontSize: 14,
    fontWeight: '600',
  },
  notesSection: {
    marginBottom: 24,
  },
  notesCard: {
    padding: 16,
    borderRadius: 12,
  },
  notesText: {
    fontSize: 15,
    lineHeight: 22,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 0,
    marginBottom: 20,
  },
});

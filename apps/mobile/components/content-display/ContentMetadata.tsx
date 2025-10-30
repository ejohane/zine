import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../contexts/theme';
import { formatDistanceToNow } from '../../lib/dateUtils';

interface Creator {
  id?: string;
  name?: string;
  avatarUrl?: string;
  verified?: boolean;
}

interface ContentMetadataProps {
  title?: string;
  creator?: Creator;
  publishedAt?: number;
  createdAt?: number;
  onCreatorPress?: (creatorId: string) => void;
}

export function ContentMetadata({ 
  title, 
  creator, 
  publishedAt,
  createdAt,
  onCreatorPress 
}: ContentMetadataProps) {
  const { colors } = useTheme();

  return (
    <View>
      <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={3}>
        {title || 'Untitled'}
      </Text>

      <View style={styles.creatorDateRow}>
        <TouchableOpacity 
          style={styles.creatorInfo}
          onPress={() => {
            if (creator?.id && onCreatorPress) {
              onCreatorPress(creator.id);
            }
          }}
          activeOpacity={0.7}
          disabled={!creator?.id || !onCreatorPress}
        >
          {creator?.avatarUrl ? (
            <Image
              source={{ uri: creator.avatarUrl }}
              style={styles.creatorAvatar}
              onError={() => {}}
            />
          ) : (
            <View style={[styles.creatorAvatarPlaceholder, { backgroundColor: colors.secondary }]}>
              <Feather name="user" size={20} color={colors.mutedForeground} />
            </View>
          )}
          <Text style={[styles.creatorName, { color: colors.foreground }]} numberOfLines={1}>
            {creator?.name || 'Unknown Creator'}
          </Text>
          {creator?.verified && (
            <Feather name="check-circle" size={14} color={colors.primary} style={styles.verifiedBadge} />
          )}
        </TouchableOpacity>
        
        <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
          {formatDistanceToNow(publishedAt || createdAt)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginTop: 0,
    marginBottom: 12,
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  creatorDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 16,
  },
  creatorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  creatorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  creatorAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorName: {
    fontSize: 16,
    fontWeight: '600',
  },
  verifiedBadge: {
    marginLeft: 4,
  },
  dateText: {
    fontSize: 14,
  },
});

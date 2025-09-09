import React from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet, Image } from 'react-native';
import { Card, Chip, Button } from 'heroui-native';

export interface BookmarkCardProps {
  id: string;
  title: string;
  url: string;
  thumbnail?: string;
  description?: string;
  platform?: 'spotify' | 'youtube' | 'apple' | 'google' | 'web';
  createdAt?: Date | string;
  tags?: string[];
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onView?: (id: string) => void;
}

const getPlatformIcon = (platform?: string) => {
  switch (platform) {
    case 'spotify':
      return '🎵';
    case 'youtube':
      return '📺';
    case 'apple':
      return '🍎';
    case 'google':
      return '🔍';
    default:
      return '🔗';
  }
};

export const BookmarkCard: React.FC<BookmarkCardProps> = ({
  id,
  title,
  url,
  thumbnail,
  description,
  platform,
  createdAt,
  tags,
  onEdit,
  onDelete,
  onView,
}) => {
  const formattedDate = createdAt
    ? new Date(createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : undefined;

  const handleOpenUrl = () => {
    Linking.openURL(url);
  };

  const hostname = new URL(url).hostname;

  return (
    <TouchableOpacity 
      onPress={() => onView?.(id)}
      activeOpacity={0.7}
    >
      <Card>
        <View style={styles.cardContent}>
          <View style={styles.contentRow}>
            {thumbnail ? (
              <Image
                source={{ uri: thumbnail }}
                style={styles.thumbnail}
              />
            ) : (
              <View style={styles.placeholderThumbnail}>
                <Text style={styles.placeholderIcon}>{getPlatformIcon(platform)}</Text>
              </View>
            )}
            
            <View style={styles.contentColumn}>
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={1}>
                  {title}
                </Text>
                {platform && (
                  <View style={styles.chipContainer}>
                    <Chip size="sm">
                      {platform}
                    </Chip>
                  </View>
                )}
              </View>
              
              {description && (
                <Text style={styles.description} numberOfLines={2}>
                  {description}
                </Text>
              )}
              
              <TouchableOpacity onPress={handleOpenUrl}>
                <Text style={styles.link}>
                  {hostname} 🔗
                </Text>
              </TouchableOpacity>
              
              {tags && tags.length > 0 && (
                <View style={styles.tagsContainer}>
                  {tags.map((tag) => (
                    <View key={tag} style={styles.tag}>
                      <Chip size="sm">
                        {tag}
                      </Chip>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
          
          <View style={styles.footer}>
            <Text style={styles.date}>
              {formattedDate}
            </Text>
            
            <View style={styles.actions}>
              {onEdit && (
                <Button
                  size="sm"
                  onPress={() => onEdit(id)}
                >
                  Edit
                </Button>
              )}
              {onDelete && (
                <Button
                  size="sm"
                  onPress={() => onDelete(id)}
                >
                  Delete
                </Button>
              )}
            </View>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  cardContent: {
    padding: 16,
  },
  contentRow: {
    flexDirection: 'row',
    gap: 16,
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  placeholderThumbnail: {
    width: 80,
    height: 80,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: {
    fontSize: 24,
  },
  contentColumn: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  chipContainer: {
    flexShrink: 0,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  link: {
    fontSize: 14,
    color: '#999',
    textDecorationLine: 'underline',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 8,
  },
  tag: {
    marginRight: 4,
    marginBottom: 4,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    marginTop: 12,
    paddingTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    fontSize: 14,
    color: '#999',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
});
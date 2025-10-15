import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/theme';
import { BORDER_RADIUS, SPACING } from './constants';
import type { BookmarkListEmptyStateProps } from './types';

export function BookmarkListEmptyState({
  icon = 'bookmark-outline',
  title = 'No bookmarks yet',
  message = 'Start saving content to see it here',
  actionLabel,
  onActionPress,
}: BookmarkListEmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <Ionicons
        name={icon as any}
        size={64}
        color={colors.mutedForeground}
        style={styles.icon}
      />
      
      <Text style={[styles.title, { color: colors.foreground }]}>
        {title}
      </Text>
      
      <Text style={[styles.message, { color: colors.mutedForeground }]}>
        {message}
      </Text>
      
      {actionLabel && onActionPress && (
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.primary }]}
          onPress={onActionPress}
          activeOpacity={0.8}
        >
          <Text style={[styles.actionLabel, { color: colors.primaryForeground }]}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    maxWidth: 300,
    alignSelf: 'center',
  },
  icon: {
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: SPACING['2xl'],
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.large,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});

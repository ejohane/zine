import * as React from 'react';
import { View, Image, Pressable } from 'react-native';
import { cn } from '../../../lib/utils';
import { Text } from '../../primitives/Text/Text.native';
import { Play, Headphones, FileText } from 'lucide-react-native';

export interface QueueItemProps {
  title: string;
  creator?: string;
  source?: string;
  thumbnailUrl?: string;
  contentType: 'video' | 'podcast' | 'article';
  className?: string;
  onPress?: () => void;
}

export const QueueItem: React.FC<QueueItemProps> = ({
  title,
  creator,
  source,
  thumbnailUrl,
  contentType,
  className,
  onPress,
}) => {
  const getContentIcon = () => {
    switch (contentType) {
      case 'video':
        return <Play size={16} color="white" />;
      case 'podcast':
        return <Headphones size={16} color="white" />;
      case 'article':
        return <FileText size={16} color="white" />;
    }
  };

  const getContentColor = () => {
    switch (contentType) {
      case 'video':
        return 'bg-youtube-500';
      case 'podcast':
        return 'bg-spotify-500';
      case 'article':
        return 'bg-brand-primary';
    }
  };

  if (onPress) {
    return (
      <Pressable onPress={onPress}>
        {({ pressed }) => (
          <View
            {...{ className: cn(
              pressed ? 'bg-neutral-50 dark:bg-neutral-800' : 'bg-white dark:bg-neutral-900',
              'rounded-lg p-3 flex-row items-center gap-3',
              className
            )} as any}
          >
            {renderContent()}
          </View>
        )}
      </Pressable>
    );
  }

  const renderContent = () => (
    <>
      {/* Thumbnail */}
      {thumbnailUrl ? (
        <Image
          source={{ uri: thumbnailUrl }}
          {...{ className: 'w-16 h-16 rounded-md' } as any}
        />
      ) : (
        <View
          {...{ className: cn(
            'w-16 h-16 rounded-md items-center justify-center',
            getContentColor()
          )} as any}
        >
          {getContentIcon()}
        </View>
      )}

      {/* Content */}
      <View {...{ className: 'flex-1 gap-1' } as any}>
        <Text
          variant="bodySmall"
          weight="medium"
          numberOfLines={1}
        >
          {title}
        </Text>
        <View {...{ className: 'flex-row gap-2 items-center' } as any}>
          {creator && (
            <Text variant="caption" color="muted">
              {creator}
            </Text>
          )}
          {creator && source && (
            <Text variant="caption" color="muted">•</Text>
          )}
          {source && (
            <Text variant="caption" color="muted">
              {source}
            </Text>
          )}
        </View>
      </View>
    </>
  );

  return (
    <View
      {...{ className: cn(
        'bg-white dark:bg-neutral-900 rounded-lg p-3 flex-row items-center gap-3',
        className
      )} as any}
    >
      {renderContent()}
    </View>
  );
};
import * as React from 'react';
import { View, Image } from 'react-native';
import { cn } from '../../../lib/utils';
import { Card, CardContent } from '../../primitives/Card/Card.native';
import { Badge } from '../../primitives/Badge/Badge.native';
import { Text } from '../../primitives/Text/Text.native';
import { Play, Headphones, FileText } from 'lucide-react-native';

export interface MediaCardProps {
  title: string;
  creator?: string;
  thumbnailUrl?: string;
  contentType: 'video' | 'podcast' | 'article';
  duration?: string;
  className?: string;
  onPress?: () => void;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  title,
  creator,
  thumbnailUrl,
  contentType,
  duration,
  className,
  onPress,
}) => {
  const getContentIcon = () => {
    switch (contentType) {
      case 'video':
        return <Play size={20} color="white" />;
      case 'podcast':
        return <Headphones size={20} color="white" />;
      case 'article':
        return <FileText size={20} color="white" />;
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

  const getContentBadgeVariant = () => {
    switch (contentType) {
      case 'video':
        return 'youtube' as const;
      case 'podcast':
        return 'spotify' as const;
      case 'article':
        return 'primary' as const;
    }
  };

  return (
    <Card
      variant="elevated"
      interactive={!!onPress}
      onPress={onPress}
      padding="none"
      className={cn('w-72 overflow-hidden', className)}
    >
      {/* Thumbnail */}
      <View {...{ className: 'h-40 relative' } as any}>
        {thumbnailUrl ? (
          <Image
            source={{ uri: thumbnailUrl }}
            {...{ className: 'w-full h-full' } as any}
          />
        ) : (
          <View
            {...{ className: cn(
              'w-full h-full items-center justify-center',
              getContentColor()
            )} as any}
          >
            {getContentIcon()}
          </View>
        )}

        {/* Content type badge */}
        <View {...{ className: 'absolute top-2 right-2' } as any}>
          <Badge variant={getContentBadgeVariant()} size="sm">
            {contentType.toUpperCase()}
          </Badge>
        </View>

        {/* Duration badge */}
        {duration && (
          <View {...{ className: 'absolute bottom-2 right-2' } as any}>
            <View {...{ className: 'bg-black/80 px-2 py-1 rounded-md' } as any}>
              <Text variant="caption" className="text-white">
                {duration}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Content */}
      <CardContent className="p-3">
        <Text
          variant="bodySmall"
          weight="semibold"
          className="mb-1"
          numberOfLines={2}
        >
          {title}
        </Text>
        {creator && (
          <Text variant="caption" color="muted">
            {creator}
          </Text>
        )}
      </CardContent>
    </Card>
  );
};
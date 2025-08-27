import * as React from 'react';
import { cn } from '../../../lib/utils';
import { Card, CardContent } from '../../primitives/Card/Card.web';
import { Badge } from '../../primitives/Badge/Badge.web';
import { Text } from '../../primitives/Text/Text.web';
import { Play, Headphones, FileText } from 'lucide-react';

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
        return <Play size={20} className="text-white" />;
      case 'podcast':
        return <Headphones size={20} className="text-white" />;
      case 'article':
        return <FileText size={20} className="text-white" />;
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
      onClick={onPress}
      padding="none"
      className={cn('w-72 overflow-hidden', className)}
    >
      {/* Thumbnail */}
      <div className="h-40 relative">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className={cn(
              'w-full h-full flex items-center justify-center',
              getContentColor()
            )}
          >
            {getContentIcon()}
          </div>
        )}

        {/* Content type badge */}
        <div className="absolute top-2 right-2">
          <Badge variant={getContentBadgeVariant()} size="sm">
            {contentType}
          </Badge>
        </div>

        {/* Duration badge */}
        {duration && (
          <div className="absolute bottom-2 right-2">
            <div className="bg-black/80 dark:bg-black/90 px-2 py-1 rounded-md">
              <Text variant="caption" className="text-white">
                {duration}
              </Text>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <CardContent className="p-3">
        <Text
          variant="bodySmall"
          weight="semibold"
          className="mb-1 line-clamp-2"
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
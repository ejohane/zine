import * as React from 'react';
import { cn } from '../../../lib/utils';
import { Text } from '../../primitives/Text/Text.web';
import { Play, Headphones, FileText } from 'lucide-react';

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
        return <Play size={16} className="text-white" />;
      case 'podcast':
        return <Headphones size={16} className="text-white" />;
      case 'article':
        return <FileText size={16} className="text-white" />;
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

  return (
    <div
      onClick={onPress}
      className={cn(
        'bg-white dark:bg-neutral-900 rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors',
        className
      )}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && onPress) {
          e.preventDefault();
          onPress();
        }
      }}
    >
      {/* Thumbnail */}
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={title}
          className="w-16 h-16 rounded-md object-cover"
        />
      ) : (
        <div
          className={cn(
            'w-16 h-16 rounded-md flex items-center justify-center',
            getContentColor()
          )}
        >
          {getContentIcon()}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <Text
          variant="bodySmall"
          weight="medium"
          className="truncate mb-1"
        >
          {title}
        </Text>
        <div className="flex items-center gap-2">
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
        </div>
      </div>
    </div>
  );
};
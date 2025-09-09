import React from 'react';
import { Card, CardBody, Avatar, Chip, Button, Progress, Link } from '@heroui/react';
import { cn } from '../../../lib/utils';

export interface SubscriptionItemProps {
  id: string;
  title: string;
  creator?: string;
  platform: 'spotify' | 'youtube' | 'apple' | 'google';
  thumbnail?: string;
  duration?: number; // in seconds
  progress?: number; // percentage 0-100
  episodeNumber?: number;
  seasonNumber?: number;
  publishedAt?: Date | string;
  isNew?: boolean;
  isPlaying?: boolean;
  onPlay?: (id: string) => void;
  onPause?: (id: string) => void;
  onMarkAsPlayed?: (id: string) => void;
  onAddToQueue?: (id: string) => void;
  url?: string;
  className?: string;
}

const formatDuration = (seconds?: number) => {
  if (!seconds) return '';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const getPlatformColor = (platform: string) => {
  switch (platform) {
    case 'spotify':
      return 'success';
    case 'youtube':
      return 'danger';
    case 'apple':
      return 'default';
    case 'google':
      return 'primary';
    default:
      return 'secondary';
  }
};

const getPlatformIcon = (platform: string) => {
  switch (platform) {
    case 'spotify':
      return '🎧';
    case 'youtube':
      return '▶️';
    case 'apple':
      return '🎙️';
    case 'google':
      return '📻';
    default:
      return '🎵';
  }
};

export const SubscriptionItem: React.FC<SubscriptionItemProps> = ({
  id,
  title,
  creator,
  platform,
  thumbnail,
  duration,
  progress = 0,
  episodeNumber,
  seasonNumber,
  publishedAt,
  isNew,
  isPlaying,
  onPlay,
  onPause,
  onMarkAsPlayed,
  onAddToQueue,
  url,
  className,
}) => {
  const formattedDate = publishedAt
    ? new Date(publishedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    : undefined;

  const handlePlayPause = () => {
    if (isPlaying && onPause) {
      onPause(id);
    } else if (!isPlaying && onPlay) {
      onPlay(id);
    }
  };

  return (
    <Card 
      className={cn(
        "w-full hover:shadow-lg transition-shadow",
        isPlaying && "ring-2 ring-primary",
        className
      )}
    >
      <CardBody className="p-4">
        <div className="flex gap-4">
          <div className="relative flex-shrink-0">
            {thumbnail ? (
              <Avatar
                src={thumbnail}
                className="w-24 h-24"
                radius="md"
                isBordered={isPlaying}
              />
            ) : (
              <div className="w-24 h-24 bg-default-100 rounded-lg flex items-center justify-center text-3xl">
                {getPlatformIcon(platform)}
              </div>
            )}
            {isNew && (
              <div className="absolute -top-2 -right-2">
                <Chip color="danger" size="sm" variant="solid">
                  NEW
                </Chip>
              </div>
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex-1">
                <h3 className="text-lg font-semibold line-clamp-2">
                  {title}
                </h3>
                {creator && (
                  <p className="text-sm text-default-500">
                    {creator}
                  </p>
                )}
              </div>
              
              <Chip
                color={getPlatformColor(platform)}
                size="sm"
                variant="flat"
                className="flex-shrink-0"
              >
                {platform}
              </Chip>
            </div>
            
            <div className="flex items-center gap-3 text-sm text-default-400 mb-2">
              {episodeNumber && (
                <span>
                  {seasonNumber && `S${seasonNumber} `}
                  E{episodeNumber}
                </span>
              )}
              {duration && <span>{formatDuration(duration)}</span>}
              {formattedDate && <span>{formattedDate}</span>}
            </div>
            
            {progress > 0 && (
              <div className="mb-2">
                <Progress 
                  value={progress} 
                  size="sm" 
                  color={progress === 100 ? "success" : "primary"}
                  className="mb-1"
                />
                <span className="text-xs text-default-400">
                  {progress}% complete
                </span>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              {(onPlay || onPause) && (
                <Button
                  size="sm"
                  color="primary"
                  variant={isPlaying ? "solid" : "flat"}
                  onPress={handlePlayPause}
                  startContent={isPlaying ? '⏸' : '▶'}
                >
                  {isPlaying ? 'Pause' : 'Play'}
                </Button>
              )}
              
              {onMarkAsPlayed && progress < 100 && (
                <Button
                  size="sm"
                  variant="flat"
                  onPress={() => onMarkAsPlayed(id)}
                >
                  Mark as Played
                </Button>
              )}
              
              {onAddToQueue && (
                <Button
                  size="sm"
                  variant="flat"
                  onPress={() => onAddToQueue(id)}
                >
                  Add to Queue
                </Button>
              )}
              
              {url && (
                <Link
                  href={url}
                  size="sm"
                  isExternal
                  showAnchorIcon
                  className="ml-auto"
                >
                  Open
                </Link>
              )}
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
};
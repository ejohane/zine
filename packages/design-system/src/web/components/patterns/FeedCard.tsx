import React from 'react';
import { Card, CardBody, CardHeader, Avatar, Chip, Button, Link, Badge } from '@heroui/react';
import { cn } from '../../../lib/utils';

export interface FeedCardProps {
  id: string;
  title: string;
  description?: string;
  url: string;
  platform: 'spotify' | 'youtube' | 'apple' | 'google' | 'rss';
  thumbnail?: string;
  creator?: string;
  subscriberCount?: number;
  episodeCount?: number;
  lastUpdated?: Date | string;
  updateFrequency?: 'daily' | 'weekly' | 'monthly' | 'irregular';
  isSubscribed?: boolean;
  isActive?: boolean;
  categories?: string[];
  onSubscribe?: (id: string) => void;
  onUnsubscribe?: (id: string) => void;
  onRefresh?: (id: string) => void;
  onView?: (id: string) => void;
  className?: string;
}

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
    case 'rss':
      return 'warning';
    default:
      return 'secondary';
  }
};

const getPlatformIcon = (platform: string) => {
  switch (platform) {
    case 'spotify':
      return '🎵';
    case 'youtube':
      return '📺';
    case 'apple':
      return '🍎';
    case 'google':
      return '🔍';
    case 'rss':
      return '📡';
    default:
      return '📻';
  }
};

const formatSubscriberCount = (count?: number) => {
  if (!count) return '';
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M subscribers`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K subscribers`;
  }
  return `${count} subscribers`;
};

export const FeedCard: React.FC<FeedCardProps> = ({
  id,
  title,
  description,
  url,
  platform,
  thumbnail,
  creator,
  subscriberCount,
  episodeCount,
  lastUpdated,
  updateFrequency,
  isSubscribed,
  isActive = true,
  categories,
  onSubscribe,
  onUnsubscribe,
  onRefresh,
  onView,
  className,
}) => {
  const formattedDate = lastUpdated
    ? new Date(lastUpdated).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : undefined;

  const handleSubscriptionToggle = () => {
    if (isSubscribed && onUnsubscribe) {
      onUnsubscribe(id);
    } else if (!isSubscribed && onSubscribe) {
      onSubscribe(id);
    }
  };

  return (
    <Card 
      className={cn(
        "w-full hover:shadow-lg transition-shadow",
        !isActive && "opacity-60",
        className
      )}
      isPressable={!!onView}
      onPress={() => onView?.(id)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start gap-4 w-full">
          <div className="relative">
            {thumbnail ? (
              <Avatar
                src={thumbnail}
                className="w-16 h-16"
                radius="md"
                isBordered
              />
            ) : (
              <div className="w-16 h-16 bg-default-100 rounded-lg flex items-center justify-center text-2xl">
                {getPlatformIcon(platform)}
              </div>
            )}
            {!isActive && (
              <Badge
                color="warning"
                size="sm"
                className="absolute -top-2 -right-2"
              >
                Inactive
              </Badge>
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <h3 className="text-lg font-semibold line-clamp-1">
                  {title}
                </h3>
                {creator && (
                  <p className="text-sm text-default-500">
                    by {creator}
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
          </div>
        </div>
      </CardHeader>
      
      <CardBody className="pt-0">
        {description && (
          <p className="text-sm text-default-600 line-clamp-2 mb-3">
            {description}
          </p>
        )}
        
        <div className="flex flex-wrap items-center gap-3 text-sm text-default-400 mb-3">
          {subscriberCount !== undefined && (
            <span>{formatSubscriberCount(subscriberCount)}</span>
          )}
          {episodeCount !== undefined && (
            <span>{episodeCount} episodes</span>
          )}
          {updateFrequency && (
            <Chip size="sm" variant="dot">
              Updates {updateFrequency}
            </Chip>
          )}
        </div>
        
        {categories && categories.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {categories.map((category) => (
              <Chip key={category} size="sm" variant="flat">
                {category}
              </Chip>
            ))}
          </div>
        )}
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {(onSubscribe || onUnsubscribe) && (
              <Button
                size="sm"
                color={isSubscribed ? "default" : "primary"}
                variant={isSubscribed ? "bordered" : "solid"}
                onPress={handleSubscriptionToggle}
              >
                {isSubscribed ? 'Unsubscribe' : 'Subscribe'}
              </Button>
            )}
            
            {onRefresh && (
              <Button
                size="sm"
                variant="flat"
                onPress={() => onRefresh(id)}
                isIconOnly
              >
                🔄
              </Button>
            )}
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            {lastUpdated && (
              <span className="text-default-400">
                Updated {formattedDate}
              </span>
            )}
            
            <Link
              href={url}
              size="sm"
              isExternal
              showAnchorIcon
            >
              View
            </Link>
          </div>
        </div>
      </CardBody>
    </Card>
  );
};
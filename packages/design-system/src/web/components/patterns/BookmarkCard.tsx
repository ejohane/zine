import React from 'react';
import { Card, CardBody, CardFooter, Chip, Avatar, Button, Link } from '@heroui/react';
import { cn } from '../../../lib/utils';

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
  className?: string;
}

const getPlatformColor = (platform?: string) => {
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
  className,
}) => {
  const formattedDate = createdAt
    ? new Date(createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : undefined;

  return (
    <Card 
      className={cn("w-full hover:shadow-lg transition-shadow", className)}
      isPressable
      onPress={() => onView?.(id)}
    >
      <CardBody className="p-4">
        <div className="flex gap-4">
          {thumbnail ? (
            <Avatar
              src={thumbnail}
              className="w-20 h-20 flex-shrink-0"
              radius="sm"
              isBordered
            />
          ) : (
            <div className="w-20 h-20 flex-shrink-0 bg-default-100 rounded-lg flex items-center justify-center text-2xl">
              {getPlatformIcon(platform)}
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="text-lg font-semibold truncate flex-1">
                {title}
              </h3>
              {platform && (
                <Chip
                  color={getPlatformColor(platform)}
                  size="sm"
                  variant="flat"
                  className="flex-shrink-0"
                >
                  {platform}
                </Chip>
              )}
            </div>
            
            {description && (
              <p className="text-sm text-default-500 line-clamp-2 mb-2">
                {description}
              </p>
            )}
            
            <Link
              href={url}
              size="sm"
              isExternal
              showAnchorIcon
              className="text-default-400"
            >
              {new URL(url).hostname}
            </Link>
            
            {tags && tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((tag) => (
                  <Chip key={tag} size="sm" variant="dot">
                    {tag}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardBody>
      
      <CardFooter className="px-4 py-3 border-t border-default-100">
        <div className="flex items-center justify-between w-full">
          <span className="text-sm text-default-400">
            {formattedDate}
          </span>
          
          <div className="flex gap-2">
            {onEdit && (
              <Button
                size="sm"
                variant="flat"
                onPress={() => onEdit(id)}
              >
                Edit
              </Button>
            )}
            {onDelete && (
              <Button
                size="sm"
                color="danger"
                variant="flat"
                onPress={() => onDelete(id)}
              >
                Delete
              </Button>
            )}
          </div>
        </div>
      </CardFooter>
    </Card>
  );
};
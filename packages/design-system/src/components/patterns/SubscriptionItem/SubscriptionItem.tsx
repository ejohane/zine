import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PlayIcon, CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SubscriptionItemProps {
  title: string;
  author: string;
  thumbnail?: string;
  duration?: string;
  platform: 'spotify' | 'youtube' | 'podcast';
  isPlayed?: boolean;
  isPlaying?: boolean;
  publishedAt: Date;
  onPlay?: () => void;
  onMarkPlayed?: () => void;
}

export function SubscriptionItem({
  title,
  author,
  thumbnail,
  duration,
  platform,
  isPlayed = false,
  isPlaying = false,
  publishedAt,
  onPlay,
  onMarkPlayed,
}: SubscriptionItemProps) {
  const platformConfig = {
    spotify: { color: 'bg-green-500', label: 'Podcast' },
    youtube: { color: 'bg-red-500', label: 'Video' },
    podcast: { color: 'bg-purple-500', label: 'Episode' },
  };

  const config = platformConfig[platform];

  return (
    <div className={cn(
      "flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors",
      isPlayed && "opacity-60"
    )}>
      <div className="relative">
        <Avatar className="h-16 w-16">
          {thumbnail ? (
            <AvatarImage src={thumbnail} alt={title} />
          ) : (
            <AvatarFallback className={config.color}>
              <PlayIcon className="h-6 w-6 text-white" />
            </AvatarFallback>
          )}
        </Avatar>
        {isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
            <div className="h-8 w-8 bg-white rounded-full flex items-center justify-center">
              <PlayIcon className="h-4 w-4 text-black fill-black" />
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="outline" className="text-xs">
            {config.label}
          </Badge>
          {duration && (
            <span className="text-xs text-muted-foreground">{duration}</span>
          )}
        </div>
        <h3 className={cn(
          "font-medium line-clamp-1",
          isPlayed && "line-through"
        )}>
          {title}
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-1">{author}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {publishedAt.toLocaleDateString()}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {!isPlayed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMarkPlayed}
            title="Mark as played"
          >
            <CheckIcon className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant={isPlaying ? 'default' : 'outline'}
          size="sm"
          onClick={onPlay}
        >
          <PlayIcon className="h-4 w-4 mr-1" />
          {isPlaying ? 'Playing' : 'Play'}
        </Button>
      </div>
    </div>
  );
}
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { BookmarkIcon, ExternalLinkIcon, MoreVerticalIcon } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export interface BookmarkCardProps {
  title: string;
  description?: string;
  url: string;
  favicon?: string;
  tags?: string[];
  platform?: 'web' | 'spotify' | 'youtube' | 'rss';
  savedAt: Date;
  onEdit?: () => void;
  onDelete?: () => void;
  onOpen?: () => void;
}

export function BookmarkCard({
  title,
  description,
  url,
  favicon,
  tags = [],
  platform = 'web',
  savedAt,
  onEdit,
  onDelete,
  onOpen,
}: BookmarkCardProps) {
  const platformColors = {
    spotify: 'bg-green-500',
    youtube: 'bg-red-500',
    rss: 'bg-orange-500',
    web: 'bg-blue-500',
  };

  return (
    <Card className="group hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              {favicon ? (
                <AvatarImage src={favicon} alt={title} />
              ) : (
                <AvatarFallback className={platformColors[platform]}>
                  <BookmarkIcon className="h-4 w-4 text-white" />
                </AvatarFallback>
              )}
            </Avatar>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{title}</h3>
              <p className="text-sm text-muted-foreground truncate">{new URL(url).hostname}</p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreVerticalIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onOpen}>
                <ExternalLinkIcon className="mr-2 h-4 w-4" />
                Open
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      
      {description && (
        <CardContent className="pb-3">
          <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
        </CardContent>
      )}
      
      <CardFooter className="pt-3">
        <div className="flex items-center justify-between w-full">
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{tags.length - 3}
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {savedAt.toLocaleDateString()}
          </span>
        </div>
      </CardFooter>
    </Card>
  );
}
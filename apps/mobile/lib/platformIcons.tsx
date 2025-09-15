// @ts-nocheck
import * as React from 'react';
import { MaterialCommunityIcons, FontAwesome5, Ionicons } from '@expo/vector-icons';
import type { Source, ContentType } from '@zine/shared';

interface PlatformIconProps {
  source?: Source;
  size?: number;
  color?: string;
}

export function PlatformIcon({ source, size = 16, color = '#666' }: PlatformIconProps) {
  switch (source) {
    case 'youtube':
      return <FontAwesome5 name="youtube" size={size} color="#FF0000" />;
    case 'spotify':
      return <FontAwesome5 name="spotify" size={size} color="#1DB954" />;
    case 'twitter':
    case 'x':
      return <FontAwesome5 name="twitter" size={size} color="#1DA1F2" />;
    case 'substack':
      return <MaterialCommunityIcons name="email-newsletter" size={size} color="#FF6719" />;
    case 'web':
    default:
      return <Ionicons name="globe-outline" size={size} color={color} />;
  }
}

interface ContentTypeIconProps {
  contentType?: ContentType;
  size?: number;
  color?: string;
}

export function ContentTypeIcon({ contentType, size = 16, color = '#666' }: ContentTypeIconProps) {
  switch (contentType) {
    case 'video':
      return <Ionicons name="play-circle-outline" size={size} color={color} />;
    case 'podcast':
      return <Ionicons name="mic-outline" size={size} color={color} />;
    case 'article':
      return <Ionicons name="document-text-outline" size={size} color={color} />;
    case 'post':
      return <MaterialCommunityIcons name="post-outline" size={size} color={color} />;
    case 'link':
    default:
      return <Ionicons name="link-outline" size={size} color={color} />;
  }
}

export function ExternalLinkIcon({ size = 16, color = '#666' }: { size?: number; color?: string }) {
  return <Ionicons name="open-outline" size={size} color={color} />;
}

// Helper function to get platform info from URL
export function getPlatformInfo(url: string): { name: string; color: string; icon: React.ReactElement } {
  if (!url) {
    return { 
      name: 'Web', 
      color: 'default',
      icon: <Ionicons name="globe-outline" size={14} color="#666" />
    };
  }
  
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
    return { 
      name: 'YouTube', 
      color: 'danger',
      icon: <FontAwesome5 name="youtube" size={14} color="#FF0000" />
    };
  }
  
  if (urlLower.includes('spotify.com')) {
    return { 
      name: 'Spotify', 
      color: 'success',
      icon: <FontAwesome5 name="spotify" size={14} color="#1DB954" />
    };
  }
  
  if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) {
    return { 
      name: 'Twitter', 
      color: 'primary',
      icon: <FontAwesome5 name="twitter" size={14} color="#1DA1F2" />
    };
  }
  
  if (urlLower.includes('substack.com')) {
    return { 
      name: 'Substack', 
      color: 'warning',
      icon: <MaterialCommunityIcons name="email-newsletter" size={14} color="#FF6719" />
    };
  }
  
  return { 
    name: 'Web', 
    color: 'default',
    icon: <Ionicons name="globe-outline" size={14} color="#666" />
  };
}
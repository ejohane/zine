import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';

// FAB Configuration by Provider

const FAB_ICON_COLOR = '#FFFFFF';

type FabConfig = {
  backgroundColor: string;
  providerIcon: ReactNode;
};

function SubstackIcon({ size = 22, color = FAB_ICON_COLOR }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        fill={color}
        d="M15 3.604H1v1.891h14v-1.89ZM1 7.208V16l7-3.926L15 16V7.208zM15 0H1v1.89h14z"
      />
    </Svg>
  );
}

export function getFabConfig(provider: string): FabConfig {
  switch (provider) {
    case 'SPOTIFY':
      return {
        providerIcon: <FontAwesome5 name="spotify" size={22} color={FAB_ICON_COLOR} />,
        backgroundColor: '#1DB954',
      };
    case 'YOUTUBE':
      return {
        providerIcon: <Ionicons name="logo-youtube" size={22} color={FAB_ICON_COLOR} />,
        backgroundColor: '#FF0000',
      };
    case 'GMAIL':
      return {
        providerIcon: <Ionicons name="newspaper-outline" size={22} color={FAB_ICON_COLOR} />,
        backgroundColor: '#1A73E8',
      };
    case 'SUBSTACK':
      return {
        providerIcon: <SubstackIcon />,
        backgroundColor: '#FF6719',
      };
    case 'X':
    case 'TWITTER':
      return {
        providerIcon: (
          <Text style={{ color: FAB_ICON_COLOR, fontSize: 20, fontWeight: '800' }}>𝕏</Text>
        ),
        backgroundColor: '#1A1A1A',
      };
    default:
      // Web and other providers
      return {
        providerIcon: <Ionicons name="globe-outline" size={22} color={FAB_ICON_COLOR} />,
        backgroundColor: '#1A1A1A',
      };
  }
}

// Helper Functions

/**
 * Extract @handle from X/Twitter URL
 * e.g., "https://x.com/elithrar/status/123" => "elithrar"
 */
export function extractXHandle(url: string): string | null {
  const match = url.match(/(?:x\.com|twitter\.com)\/([^/]+)\//);
  return match ? match[1] : null;
}

/**
 * Extract podcast host names from description.
 * Looks for common patterns like "from X and Y", "by X and Y", "with X and Y"
 * Returns null if no pattern is found.
 */
export function extractPodcastHosts(description: string | null | undefined): string | null {
  if (!description) return null;

  // Common patterns for podcast host attribution
  const patterns = [
    /(?:from|by|hosted by|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+and\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)+)/i,
    /(?:from|by|hosted by|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

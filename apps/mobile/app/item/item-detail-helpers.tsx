import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

// ============================================================================
// FAB Configuration by Provider
// ============================================================================

type FabConfig = {
  backgroundColor: string;
  providerIcon: ReactNode;
};

export function getFabConfig(provider: string): FabConfig {
  switch (provider) {
    case 'SPOTIFY':
      return {
        providerIcon: <FontAwesome5 name="spotify" size={22} color="#FFFFFF" />,
        backgroundColor: '#1DB954',
      };
    case 'YOUTUBE':
      return {
        providerIcon: <Ionicons name="logo-youtube" size={22} color="#FFFFFF" />,
        backgroundColor: '#FF0000',
      };
    case 'X':
    case 'TWITTER':
      return {
        providerIcon: <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800' }}>𝕏</Text>,
        backgroundColor: '#1A1A1A',
      };
    default:
      // Web, Substack, and other providers
      return {
        providerIcon: <Ionicons name="globe-outline" size={22} color="#FFFFFF" />,
        backgroundColor: '#1A1A1A',
      };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

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

import React, { useState, useEffect, useRef } from 'react';
import { View, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { 
  cacheDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  downloadAsync,
  readDirectoryAsync,
  deleteAsync
} from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';

interface OptimizedBookmarkImageProps {
  url?: string;
  style?: any;
  contentType?: string;
  fallbackIcon?: string;
  onLoad?: () => void;
  onError?: () => void;
}

const CACHE_DIR = `${cacheDirectory}bookmark-images/`;
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days

async function ensureCacheDir() {
  const dirInfo = await getInfoAsync(CACHE_DIR);
  if (!dirInfo.exists) {
    await makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

async function getCachedImagePath(url: string): Promise<string | null> {
  try {
    await ensureCacheDir();
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      url
    );
    const urlWithoutQuery = url.split('?')[0];
    const rawExt = urlWithoutQuery.includes('.')
      ? urlWithoutQuery.split('.').pop() || ''
      : '';
    const normalizedExt = rawExt && /^[a-zA-Z0-9]+$/.test(rawExt)
      ? rawExt
      : 'jpg';
    return `${CACHE_DIR}${hash}.${normalizedExt}`;
  } catch {
    return null;
  }
}

async function isCacheValid(path: string): Promise<boolean> {
  try {
    const info = await getInfoAsync(path);
    if (!info.exists) return false;
    
    const now = Date.now();
    const fileTime = info.modificationTime ? info.modificationTime * 1000 : 0;
    return now - fileTime < CACHE_EXPIRY;
  } catch {
    return false;
  }
}

async function downloadAndCacheImage(url: string, cachePath: string): Promise<string> {
  const downloadResult = await downloadAsync(url, cachePath);
  return downloadResult.uri;
}

export const OptimizedBookmarkImage = React.memo<OptimizedBookmarkImageProps>(({
  url,
  style,
  contentType,
  fallbackIcon,
  onLoad,
  onError,
}) => {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!url) {
      setError(true);
      return;
    }

    let cancelled = false;

    const loadImage = async () => {
      try {
        setLoading(true);
        setError(false);

        const cachePath = await getCachedImagePath(url);
        if (!cachePath) {
          throw new Error('Failed to generate cache path');
        }

        const isValid = await isCacheValid(cachePath);
        
        let uri: string;
        if (isValid) {
          uri = cachePath;
        } else {
          uri = await downloadAndCacheImage(url, cachePath);
        }

        if (!cancelled && isMounted.current) {
          setImageUri(uri);
          setLoading(false);
          onLoad?.();
        }
      } catch (err) {
        if (!cancelled && isMounted.current) {
          setError(true);
          setLoading(false);
          onError?.();
        }
      }
    };

    loadImage();

    return () => {
      cancelled = true;
    };
  }, [url, onLoad, onError]);

  const getContentIcon = () => {
    if (fallbackIcon) {
      return fallbackIcon as any;
    }
    
    switch (contentType) {
      case 'video':
        return 'play-circle';
      case 'podcast':
        return 'mic';
      case 'article':
        return 'document-text';
      case 'post':
        return 'chatbubble';
      default:
        return 'link';
    }
  };

  if (loading) {
    return (
      <View style={[{ backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' }, style]}>
        <ActivityIndicator size="small" color="#9ca3af" />
      </View>
    );
  }

  if (error || !imageUri) {
    return (
      <View style={[{ backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' }, style]}>
        <Ionicons name={getContentIcon()} size={24} color="#9ca3af" />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: imageUri }}
      style={style}
      resizeMode="cover"
    />
  );
});

OptimizedBookmarkImage.displayName = 'OptimizedBookmarkImage';

// Utility to clean up old cache
export async function cleanImageCache(maxAge = CACHE_EXPIRY) {
  try {
    await ensureCacheDir();
    const files = await readDirectoryAsync(CACHE_DIR);
    const now = Date.now();
    
    for (const file of files) {
      const filePath = `${CACHE_DIR}${file}`;
      const info = await getInfoAsync(filePath);
      
      if (info.exists && info.modificationTime) {
        const fileAge = now - (info.modificationTime * 1000);
        if (fileAge > maxAge) {
          await deleteAsync(filePath, { idempotent: true });
        }
      }
    }
  } catch (error) {
    console.error('Failed to clean image cache:', error);
  }
}

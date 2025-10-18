import * as React from 'react';
import { View, Text, Pressable, useWindowDimensions, ScrollView } from 'react-native';
import RenderHtml from 'react-native-render-html';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { ZoomIn, ZoomOut, ExternalLink } from 'lucide-react-native';
import type { Bookmark } from '@zine/shared';
import { useTheme } from '../contexts/theme';

interface ArticleContentProps {
  html?: string;
  fallbackUrl: string;
  bookmark: Bookmark;
}

export function ArticleContent({ html, fallbackUrl, bookmark }: ArticleContentProps) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [fontSize, setFontSize] = React.useState(16);

  // Increase font size
  const increaseFontSize = React.useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFontSize(prev => Math.min(prev + 2, 24));
  }, []);

  // Decrease font size
  const decreaseFontSize = React.useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFontSize(prev => Math.max(prev - 2, 12));
  }, []);

  // Open original URL
  const openOriginalUrl = React.useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const canOpen = await Linking.canOpenURL(fallbackUrl);
      if (canOpen) {
        await Linking.openURL(fallbackUrl);
      }
    } catch (error) {
      console.error('Error opening URL:', error);
    }
  }, [fallbackUrl]);

  // If no HTML content, show fallback
  if (!html) {
    return (
      <View style={{ paddingHorizontal: 20, paddingVertical: 24 }}>
        <View style={{
          backgroundColor: colors.muted,
          borderRadius: 12,
          padding: 20,
          alignItems: 'center'
        }}>
          <Text style={{
            fontSize: 16,
            fontWeight: '600',
            color: colors.foreground,
            marginBottom: 8,
            textAlign: 'center'
          }}>
            Full article content not available
          </Text>
          <Text style={{
            fontSize: 14,
            color: colors.mutedForeground,
            textAlign: 'center',
            marginBottom: 20
          }}>
            {bookmark.description || 'This article could not be extracted. Open in browser to read the full content.'}
          </Text>
          <Pressable
            onPress={openOriginalUrl}
            style={{
              backgroundColor: colors.primary,
              paddingHorizontal: 20,
              paddingVertical: 12,
              borderRadius: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8
            }}
          >
            <ExternalLink size={18} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>
              Open in Browser
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Custom styles for HTML rendering
  const tagsStyles = {
    body: {
      color: colors.foreground,
      fontSize,
      lineHeight: fontSize * 1.6,
    },
    p: {
      marginBottom: 16,
      color: colors.foreground,
    },
    h1: {
      fontSize: fontSize + 12,
      fontWeight: '700',
      marginTop: 24,
      marginBottom: 16,
      color: colors.foreground,
    },
    h2: {
      fontSize: fontSize + 8,
      fontWeight: '700',
      marginTop: 20,
      marginBottom: 12,
      color: colors.foreground,
    },
    h3: {
      fontSize: fontSize + 4,
      fontWeight: '600',
      marginTop: 16,
      marginBottom: 10,
      color: colors.foreground,
    },
    h4: {
      fontSize: fontSize + 2,
      fontWeight: '600',
      marginTop: 14,
      marginBottom: 8,
      color: colors.foreground,
    },
    a: {
      color: colors.primary,
      textDecorationLine: 'underline',
    },
    blockquote: {
      borderLeftWidth: 4,
      borderLeftColor: colors.border,
      paddingLeft: 16,
      marginLeft: 0,
      marginVertical: 16,
      fontStyle: 'italic',
      color: colors.mutedForeground,
    },
    pre: {
      backgroundColor: colors.muted,
      padding: 12,
      borderRadius: 6,
      marginVertical: 12,
      overflow: 'scroll',
    },
    code: {
      backgroundColor: colors.muted,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 3,
      fontFamily: 'monospace',
      fontSize: fontSize - 2,
    },
    ul: {
      marginVertical: 8,
      paddingLeft: 20,
    },
    ol: {
      marginVertical: 8,
      paddingLeft: 20,
    },
    li: {
      marginBottom: 8,
      color: colors.foreground,
    },
    img: {
      marginVertical: 16,
      borderRadius: 8,
    },
    hr: {
      marginVertical: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
  };

  return (
    <View>
      {/* Font size controls */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.muted + '40',
      }}>
        <Text style={{ fontSize: 14, color: colors.mutedForeground, fontWeight: '500' }}>
          Text Size
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable
            onPress={decreaseFontSize}
            disabled={fontSize <= 12}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: fontSize <= 12 ? colors.muted : colors.card,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.border,
            }}
            hitSlop={8}
          >
            <ZoomOut size={18} color={fontSize <= 12 ? colors.mutedForeground : colors.foreground} />
          </Pressable>
          <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: '600', minWidth: 30, textAlign: 'center' }}>
            {fontSize}
          </Text>
          <Pressable
            onPress={increaseFontSize}
            disabled={fontSize >= 24}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: fontSize >= 24 ? colors.muted : colors.card,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.border,
            }}
            hitSlop={8}
          >
            <ZoomIn size={18} color={fontSize >= 24 ? colors.mutedForeground : colors.foreground} />
          </Pressable>
        </View>
      </View>

      {/* Article HTML content */}
      <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
        <RenderHtml
          contentWidth={width - 40}
          source={{ html }}
          tagsStyles={tagsStyles}
          defaultTextProps={{
            selectable: true,
          }}
          renderersProps={{
            a: {
              onPress: async (event, href) => {
                try {
                  const canOpen = await Linking.canOpenURL(href);
                  if (canOpen) {
                    await Linking.openURL(href);
                  }
                } catch (error) {
                  console.error('Error opening link:', error);
                }
              },
            },
          }}
        />
      </View>

      {/* Footer with link to original */}
      <View style={{
        marginTop: 32,
        marginHorizontal: 20,
        paddingVertical: 16,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}>
        <Pressable
          onPress={openOriginalUrl}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
          }}
        >
          <ExternalLink size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>
            View Original Article
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

import { Ionicons } from '@expo/vector-icons';
import { WebView } from '@expo/dom-webview';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { DomWebViewRef } from '@expo/dom-webview';

import { Radius, Spacing } from '@/constants/theme';
import { logger } from '@/lib/logger';

import type { ItemDetailColors } from '../types';

type ItemDetailArticleWebViewProps = {
  url: string | null;
  colors: ItemDetailColors;
  insets: EdgeInsets;
  visible: boolean;
  onClose: () => void;
};

export function ItemDetailArticleWebView({
  url,
  colors,
  insets,
  visible,
  onClose,
}: ItemDetailArticleWebViewProps) {
  const webViewRef = useRef<DomWebViewRef>(null);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const [isLoaded, setIsLoaded] = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);

  useEffect(() => {
    setIsLoaded(false);
    const timeout = setTimeout(() => setIsLoaded(true), 1200);
    return () => clearTimeout(timeout);
  }, [url]);

  useEffect(() => {
    if (!visible) return;

    setControlsHidden(false);
    requestAnimationFrame(() => {
      webViewRef.current?.scrollTo({ x: 0, y: 0, animated: false });
    });
  }, [url, visible]);

  useEffect(() => {
    Animated.timing(controlsOpacity, {
      toValue: controlsHidden ? 0 : 1,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [controlsHidden, controlsOpacity]);

  const handleReaderMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type?: string; y?: number };
      if (message.type === 'article-tap') {
        setControlsHidden(false);
        return;
      }

      if (message.type !== 'article-scroll' || typeof message.y !== 'number') return;

      setControlsHidden((current) => {
        if (current) {
          return message.y > 8;
        }

        return message.y > 28;
      });
    } catch {
      // Ignore messages that are not from the article scroll bridge.
    }
  }, []);

  const handleOpenOriginal = useCallback(() => {
    if (!url) return;

    void Linking.openURL(url).catch((error) => {
      logger.error('Failed to open original article URL', { error, url });
    });
  }, [url]);

  if (Platform.OS !== 'ios' || !url) {
    return null;
  }

  return (
    <View
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[
        componentStyles.overlay,
        { backgroundColor: colors.background },
        visible ? componentStyles.overlayVisible : componentStyles.overlayHidden,
      ]}
    >
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={componentStyles.webView}
        containerStyle={componentStyles.webViewContainer}
        bounces
        scrollEnabled
        showsVerticalScrollIndicator
        onMessage={handleReaderMessage}
        injectedJavaScriptBeforeContentLoaded={ARTICLE_SCROLL_BRIDGE_SCRIPT}
        automaticallyAdjustsScrollIndicatorInsets={false}
        contentInset={{ top: 0, left: 0, bottom: 0, right: 0 }}
        contentInsetAdjustmentBehavior="never"
      />

      <Animated.View
        pointerEvents={controlsHidden ? 'none' : 'auto'}
        style={[
          componentStyles.floatingControls,
          { top: insets.top + Spacing.sm, left: Spacing.lg, right: Spacing.lg },
          {
            opacity: controlsOpacity,
            transform: [
              {
                translateY: controlsOpacity.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-6, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Pressable
          onPress={onClose}
          style={[componentStyles.iconButton, { backgroundColor: colors.backgroundSecondary }]}
          accessibilityLabel="Close article"
        >
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>

        <Pressable
          onPress={handleOpenOriginal}
          style={[componentStyles.iconButton, { backgroundColor: colors.backgroundSecondary }]}
          accessibilityLabel="Open original article"
        >
          <Ionicons name="open-outline" size={20} color={colors.text} />
        </Pressable>
      </Animated.View>

      {visible && !isLoaded && (
        <View style={componentStyles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={colors.text} />
        </View>
      )}
    </View>
  );
}

const ARTICLE_SCROLL_BRIDGE_SCRIPT = `
(function () {
  if (window.__zineArticleScrollBridgeInstalled) return true;
  window.__zineArticleScrollBridgeInstalled = true;

  var lastSent = -1;
  var rafId = null;

  function sendScrollPosition() {
    rafId = null;
    var y = window.scrollY || document.documentElement.scrollTop || 0;
    if (Math.abs(y - lastSent) < 8 && !(lastSent <= 28 && y <= 28)) {
      return;
    }

    lastSent = y;
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'article-scroll',
      y: y
    }));
  }

  window.addEventListener('scroll', function () {
    if (rafId !== null) return;
    rafId = window.requestAnimationFrame(sendScrollPosition);
  }, { passive: true });

  window.addEventListener('touchend', function () {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'article-tap'
    }));
  }, { passive: true });

  sendScrollPosition();
  return true;
})();
`;

const componentStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayVisible: {
    opacity: 1,
    zIndex: 300,
  },
  overlayHidden: {
    opacity: 0,
    zIndex: 0,
  },
  webViewContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
  floatingControls: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

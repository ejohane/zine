import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExtendedStackNavigationOptions } from 'expo-router/build/layouts/StackClient';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { Colors } from '@/constants/theme';

export const COLLAPSED_TITLE_THRESHOLD = 44;

export function getCollapsedHeaderTitleThreshold(
  titleStartY: number,
  collapsedTitleThreshold = COLLAPSED_TITLE_THRESHOLD
) {
  if (!Number.isFinite(titleStartY)) {
    return collapsedTitleThreshold;
  }

  return Math.max(collapsedTitleThreshold, titleStartY - collapsedTitleThreshold);
}

export const lightweightHeaderStackScreenOptions: ExtendedStackNavigationOptions = {
  headerBackButtonDisplayMode: 'minimal',
  headerShadowVisible: false,
  contentStyle: {
    backgroundColor: Colors.dark.background,
  },
  headerStyle: {
    backgroundColor: Colors.dark.background,
  },
  headerTintColor: Colors.dark.text,
  headerTitleStyle: {
    color: Colors.dark.text,
  },
};

export function createLightweightHeaderScreenOptions({
  backgroundColor,
  tintColor,
  screenTitle,
  showScreenTitle = true,
  headerStyle,
  headerTitleStyle,
  ...options
}: ExtendedStackNavigationOptions & {
  backgroundColor: string;
  tintColor: string;
  screenTitle: string;
  showScreenTitle?: boolean;
}): ExtendedStackNavigationOptions {
  return {
    headerLargeTitle: false,
    headerTransparent: false,
    headerShadowVisible: false,
    ...options,
    title: showScreenTitle ? screenTitle : '',
    headerTintColor: tintColor,
    headerStyle: {
      backgroundColor,
      ...headerStyle,
    },
    headerTitleStyle: {
      color: tintColor,
      ...headerTitleStyle,
    },
  };
}

export function useCollapsedHeaderTitle({
  threshold = COLLAPSED_TITLE_THRESHOLD,
}: {
  threshold?: number;
} = {}) {
  const scrollOffsetYRef = useRef(0);
  const [showCollapsedTitle, setShowCollapsedTitle] = useState(false);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      scrollOffsetYRef.current = offsetY;

      const shouldShowCollapsedTitle = offsetY > threshold;
      setShowCollapsedTitle((current) =>
        current === shouldShowCollapsedTitle ? current : shouldShowCollapsedTitle
      );
    },
    [threshold]
  );

  useEffect(() => {
    const shouldShowCollapsedTitle = scrollOffsetYRef.current > threshold;
    setShowCollapsedTitle((current) =>
      current === shouldShowCollapsedTitle ? current : shouldShowCollapsedTitle
    );
  }, [threshold]);

  return {
    handleScroll,
    scrollOffsetYRef,
    showCollapsedTitle,
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
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

export function getStickyActionRowThreshold(actionRowStartY: number, stickyTopY: number) {
  if (!Number.isFinite(actionRowStartY) || !Number.isFinite(stickyTopY)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, actionRowStartY - stickyTopY);
}

export const lightweightHeaderStackScreenOptions: NativeStackNavigationOptions = {
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
}: NativeStackNavigationOptions & {
  backgroundColor: string;
  tintColor: string;
  screenTitle: string;
  showScreenTitle?: boolean;
}): NativeStackNavigationOptions {
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

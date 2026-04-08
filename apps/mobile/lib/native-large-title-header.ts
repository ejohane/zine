import { useCallback, useRef, useState } from 'react';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

const COLLAPSED_TITLE_THRESHOLD = 44;

export const lightweightHeaderStackScreenOptions: NativeStackNavigationOptions = {
  headerBackButtonDisplayMode: 'minimal',
  headerShadowVisible: false,
};

export function createLightweightHeaderScreenOptions({
  backgroundColor,
  tintColor,
  screenTitle,
  showScreenTitle = true,
  ...options
}: NativeStackNavigationOptions & {
  backgroundColor: string;
  tintColor: string;
  screenTitle: string;
  showScreenTitle?: boolean;
}): NativeStackNavigationOptions {
  return {
    ...options,
    title: showScreenTitle ? screenTitle : '',
    headerLargeTitle: false,
    headerTransparent: false,
    headerShadowVisible: false,
    headerTintColor: tintColor,
    headerStyle: {
      backgroundColor,
    },
    headerTitleStyle: {
      color: tintColor,
    },
  };
}

export function useCollapsedHeaderTitle() {
  const scrollOffsetYRef = useRef(0);
  const [showCollapsedTitle, setShowCollapsedTitle] = useState(false);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    scrollOffsetYRef.current = offsetY;

    const shouldShowCollapsedTitle = offsetY > COLLAPSED_TITLE_THRESHOLD;
    setShowCollapsedTitle((current) =>
      current === shouldShowCollapsedTitle ? current : shouldShowCollapsedTitle
    );
  }, []);

  return {
    handleScroll,
    scrollOffsetYRef,
    showCollapsedTitle,
  };
}

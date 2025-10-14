import { useCallback, useEffect, useRef } from 'react';
import { Platform, type NativeSyntheticEvent, type TextInputFocusEventData } from 'react-native';
import { useNavigation } from 'expo-router';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import type { SearchBarCommands } from 'react-native-screens';

interface UseNavigationSearchOptions {
  colors: {
    background: string;
    foreground: string;
    primary: string;
  };
  placeholder?: string;
  autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters';
  hideWhenScrolling?: boolean;
  onQueryChange: (text: string) => void;
  onSubmit?: (text: string) => void;
  onCancel?: () => void;
}

interface UseNavigationSearchResult {
  setSearchText: (text: string) => void;
  clearSearchBar: () => void;
  focusSearchBar: () => void;
}

/**
 * Thin wrapper that configures the native iOS header search bar once and exposes
 * a couple of helpers to keep it in sync with screen state.
 */
export function useNavigationSearch(options: UseNavigationSearchOptions): UseNavigationSearchResult {
  const navigation = useNavigation();
  const searchBarRef = useRef<SearchBarCommands>(null);

  const {
    colors,
    placeholder = 'Search',
    autoCapitalize = 'none',
    hideWhenScrolling = false,
    onQueryChange,
    onSubmit,
    onCancel,
  } = options;

  const handleChange = useCallback(
    (event: NativeSyntheticEvent<TextInputFocusEventData>) => {
      onQueryChange(event.nativeEvent.text ?? '');
    },
    [onQueryChange],
  );

  const handleSubmit = useCallback(
    (event: NativeSyntheticEvent<TextInputFocusEventData>) => {
      const text = event.nativeEvent.text ?? '';
      (onSubmit ?? onQueryChange)(text);
    },
    [onSubmit, onQueryChange],
  );

  const clearSearchBar = useCallback(() => {
    if (Platform.OS === 'ios') {
      searchBarRef.current?.clearText?.();
      searchBarRef.current?.cancelSearch?.();
    }
  }, []);

  const focusSearchBar = useCallback(() => {
    if (Platform.OS === 'ios') {
      searchBarRef.current?.focus?.();
    }
  }, []);

  const handleCancel = useCallback(() => {
    clearSearchBar();
    onCancel?.();
  }, [clearSearchBar, onCancel]);

  useEffect(() => {
    const optionsToApply: Partial<NativeStackNavigationOptions> = {
      headerSearchBarOptions:
        Platform.OS === 'ios'
          ? {
              ref: searchBarRef,
              placeholder,
              autoCapitalize,
              hideWhenScrolling,
              onChangeText: handleChange,
              onSearchButtonPress: handleSubmit,
              onCancelButtonPress: handleCancel,
            }
          : undefined,
    };

    navigation.setOptions(optionsToApply);
  }, [
    autoCapitalize,
    colors.background,
    colors.foreground,
    colors.primary,
    handleCancel,
    handleChange,
    handleSubmit,
    hideWhenScrolling,
    navigation,
    placeholder,
  ]);

  const setSearchText = useCallback((text: string) => {
    if (Platform.OS === 'ios') {
      searchBarRef.current?.setText?.(text);
    }
  }, []);

  return {
    setSearchText,
    clearSearchBar,
    focusSearchBar,
  };
}

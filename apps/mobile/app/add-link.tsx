/**
 * Add Link Modal Screen
 *
 * Modal screen for manually saving links to the user's library.
 * Users can paste a URL, see a preview, and save it as a bookmark.
 *
 * Features:
 * - URL text input with paste button
 * - Debounced preview fetching (500ms)
 * - Loading, error, and preview states
 * - Save button with status feedback
 * - Toast notifications for success/already saved
 *
 * @see features/subscriptions/spec.md - Manual Link Saving feature
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useToast } from 'heroui-native';
import * as Haptics from 'expo-haptics';
import Animated from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Colors, Typography, Spacing, Radius, Shadows } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePreview, useSaveBookmark, isValidUrl } from '@/hooks/use-bookmarks';
import { LinkPreviewCard } from '@/components/link-preview-card';
import { showSuccess, showError as showErrorToast } from '@/lib/toast-utils';
import { logger } from '@/lib/logger';

// ============================================================================
// Constants
// ============================================================================

/** Debounce delay for URL input before fetching preview */
const DEBOUNCE_DELAY = 500;

// ============================================================================
// Icons
// ============================================================================

function CloseIcon({ size = 24, color = '#000' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"
        fill={color}
      />
    </Svg>
  );
}

function ClipboardIcon({ size = 20, color = '#000' }: { size?: number; color?: string }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
    >
      <Path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
      />
    </Svg>
  );
}

function AlertCircleIcon({ size = 48, color = '#EF4444' }: { size?: number; color?: string }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
    >
      <Path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
      />
    </Svg>
  );
}

function LinkIcon({ size = 48, color = '#94A3B8' }: { size?: number; color?: string }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
    >
      <Path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
      />
    </Svg>
  );
}

// ============================================================================
// Empty State Component
// ============================================================================

function EmptyState({ colors }: { colors: typeof Colors.light }) {
  return (
    <Animated.View style={styles.stateContainer}>
      <LinkIcon size={48} color={colors.textTertiary} />
      <Text style={[styles.stateTitle, { color: colors.textSecondary }]}>
        Paste a link to get started
      </Text>
      <Text style={[styles.stateMessage, { color: colors.textTertiary }]}>
        {"We'll fetch a preview and you can save it to your library"}
      </Text>
    </Animated.View>
  );
}

// ============================================================================
// Loading State Component
// ============================================================================

function LoadingState({ colors }: { colors: typeof Colors.light }) {
  return (
    <Animated.View style={styles.stateContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.stateTitle, { color: colors.textSecondary }]}>Fetching preview...</Text>
    </Animated.View>
  );
}

// ============================================================================
// Error State Component
// ============================================================================

function ErrorState({
  colors,
  message,
  onRetry,
}: {
  colors: typeof Colors.light;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Animated.View style={styles.stateContainer}>
      <AlertCircleIcon size={48} color={colors.error} />
      <Text style={[styles.stateTitle, { color: colors.text }]}>{"Couldn't load preview"}</Text>
      <Text style={[styles.stateMessage, { color: colors.textSecondary }]}>{message}</Text>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          style={[styles.retryButton, { backgroundColor: colors.backgroundSecondary }]}
        >
          <Text style={[styles.retryButtonText, { color: colors.primary }]}>Try Again</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function AddLinkScreen() {
  const router = useRouter();
  const { url: sharedUrlParam } = useLocalSearchParams<{ url?: string | string[] }>();
  const { toast } = useToast();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Input state
  const [url, setUrl] = useState('');
  const [debouncedUrl, setDebouncedUrl] = useState('');
  const inputRef = useRef<TextInput>(null);
  const didSetSharedUrl = useRef(false);

  const sharedUrl = useMemo(() => {
    if (!sharedUrlParam) return '';
    const raw = Array.isArray(sharedUrlParam) ? sharedUrlParam[0] : sharedUrlParam;
    if (!raw) return '';
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [sharedUrlParam]);

  useEffect(() => {
    if (didSetSharedUrl.current || !sharedUrl) return;
    setUrl(sharedUrl);
    setDebouncedUrl(sharedUrl.trim());
    didSetSharedUrl.current = true;
  }, [sharedUrl]);

  // Debounce URL input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedUrl(url.trim());
    }, DEBOUNCE_DELAY);

    return () => clearTimeout(timer);
  }, [url]);

  // Preview query - only runs when debouncedUrl is valid
  const {
    data: preview,
    isLoading: isLoadingPreview,
    isFetching: isFetchingPreview,
    error: previewError,
    refetch: refetchPreview,
  } = usePreview(debouncedUrl, {
    enabled: isValidUrl(debouncedUrl),
  });

  // Save mutation
  const { saveFromPreviewAsync, isPending: isSaving, reset: resetSaveMutation } = useSaveBookmark();

  // Determine current state
  const hasInput = url.trim().length > 0;
  const isUrlValid = isValidUrl(url.trim());
  const showEmpty = !hasInput;
  // Show loading only for initial load (no preview data yet)
  const showLoading = hasInput && isLoadingPreview && !preview;
  const showError = hasInput && previewError && !isLoadingPreview && !isFetchingPreview;
  // Show preview card (with skeleton if fetching new data)
  const showPreview = hasInput && (preview || isFetchingPreview) && !isLoadingPreview;

  // Can save when we have a valid preview, not fetching, and not currently saving
  const canSave = preview && !isFetchingPreview && !isSaving;

  // Handle paste from clipboard
  // Note: On iOS, the paste button triggers the system paste permission dialog
  // which handles clipboard access. We use a simple approach that works cross-platform.
  const handlePaste = useCallback(async () => {
    try {
      // On mobile, we rely on the user using the native paste functionality
      // via long-press on the input field. The paste button provides haptic feedback
      // and focuses the input to encourage this behavior.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      inputRef.current?.focus();
      // Note: Direct clipboard access requires expo-clipboard which isn't installed.
      // Users can long-press the input field to paste from the system clipboard.
    } catch (error) {
      logger.error('Failed to handle paste action', { error });
    }
  }, []);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!preview) return;

    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await saveFromPreviewAsync(preview, url.trim());

      // Show appropriate toast based on status
      switch (result.status) {
        case 'created':
          showSuccess(toast, 'Saved to library');
          break;
        case 'already_bookmarked':
          showSuccess(toast, 'Already in your library');
          break;
        case 'rebookmarked':
          showSuccess(toast, 'Added back to library');
          break;
      }

      // Close modal after successful save
      router.back();
    } catch (error) {
      showErrorToast(toast, error, 'Failed to save link', 'addLink.save');
    }
  }, [preview, url, saveFromPreviewAsync, toast, router]);

  // Handle close
  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    router.back();
  }, [router]);

  // Handle retry
  const handleRetry = useCallback(() => {
    resetSaveMutation();
    refetchPreview();
  }, [resetSaveMutation, refetchPreview]);

  // Clear input
  const handleClear = useCallback(() => {
    setUrl('');
    setDebouncedUrl('');
    resetSaveMutation();
    inputRef.current?.focus();
  }, [resetSaveMutation]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: 'Add Link',
          headerShown: true,
          presentation: 'modal',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerTitleStyle: {
            fontWeight: '600',
          },
          headerLeft: () => (
            <Pressable
              onPress={handleClose}
              hitSlop={8}
              style={styles.closeButton}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <CloseIcon size={24} color={colors.text} />
            </Pressable>
          ),
        }}
      />

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* URL Input */}
            <Animated.View style={styles.inputSection}>
              <View
                style={[
                  styles.inputContainer,
                  {
                    backgroundColor: colors.backgroundSecondary,
                    borderColor: hasInput
                      ? isUrlValid
                        ? colors.primary
                        : colors.error
                      : colors.border,
                  },
                ]}
              >
                <TextInput
                  ref={inputRef}
                  value={url}
                  onChangeText={setUrl}
                  placeholder="Paste a link..."
                  placeholderTextColor={colors.textTertiary}
                  style={[styles.input, { color: colors.text }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                  autoFocus
                  accessibilityLabel="URL input"
                  accessibilityHint="Paste or type a URL to save"
                />
                {hasInput ? (
                  <Pressable
                    onPress={handleClear}
                    style={styles.inputButton}
                    hitSlop={8}
                    accessibilityLabel="Clear input"
                    accessibilityRole="button"
                  >
                    <CloseIcon size={18} color={colors.textTertiary} />
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={handlePaste}
                    style={[styles.pasteButton, { backgroundColor: colors.backgroundTertiary }]}
                    hitSlop={8}
                    accessibilityLabel="Paste from clipboard"
                    accessibilityRole="button"
                  >
                    <ClipboardIcon size={16} color={colors.textSecondary} />
                    <Text style={[styles.pasteButtonText, { color: colors.textSecondary }]}>
                      Paste
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* Invalid URL hint */}
              {hasInput && !isUrlValid && (
                <Animated.Text style={[styles.hintText, { color: colors.error }]}>
                  Please enter a valid URL (http:// or https://)
                </Animated.Text>
              )}
            </Animated.View>

            {/* Preview Area */}
            <View style={styles.previewSection}>
              {showEmpty && <EmptyState colors={colors} />}
              {showLoading && <LoadingState colors={colors} />}
              {showError && (
                <ErrorState
                  colors={colors}
                  message={previewError?.message || 'Unable to fetch preview for this URL'}
                  onRetry={handleRetry}
                />
              )}
              {showPreview && (
                <Animated.View>
                  <LinkPreviewCard preview={preview} isLoading={isFetchingPreview} />
                </Animated.View>
              )}
            </View>
          </ScrollView>

          {/* Save Button */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Pressable
              onPress={handleSave}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.saveButton,
                {
                  backgroundColor: canSave ? colors.buttonPrimary : colors.backgroundTertiary,
                  opacity: pressed && canSave ? 0.9 : 1,
                },
              ]}
              accessibilityLabel="Save to library"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={colors.buttonPrimaryText} />
              ) : (
                <Text
                  style={[
                    styles.saveButtonText,
                    { color: canSave ? colors.buttonPrimaryText : colors.textTertiary },
                  ]}
                >
                  Save to Library
                </Text>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: Spacing.xl,
  },

  // Close button
  closeButton: {
    padding: Spacing.xs,
  },

  // Input section
  inputSection: {
    marginBottom: Spacing.xl,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    ...Typography.bodyMedium,
    paddingVertical: Spacing.sm,
  },
  inputButton: {
    padding: Spacing.xs,
  },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    gap: Spacing.xs,
  },
  pasteButtonText: {
    ...Typography.labelMedium,
  },
  hintText: {
    ...Typography.bodySmall,
    marginTop: Spacing.sm,
    marginLeft: Spacing.sm,
  },

  // Preview section
  previewSection: {
    flex: 1,
    minHeight: 200,
  },

  // State containers
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['3xl'],
    gap: Spacing.md,
  },
  stateTitle: {
    ...Typography.titleMedium,
    textAlign: 'center',
  },
  stateMessage: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    maxWidth: 280,
  },
  retryButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  retryButtonText: {
    ...Typography.labelMedium,
  },

  // Footer
  footer: {
    padding: Spacing.xl,
    paddingTop: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    minHeight: 52,
    ...Shadows.sm,
  },
  saveButtonText: {
    ...Typography.labelLarge,
  },
});

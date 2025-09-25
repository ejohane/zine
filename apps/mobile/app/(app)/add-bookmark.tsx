import { View, Text, TouchableOpacity, StyleSheet, Platform, StatusBar, KeyboardAvoidingView, ScrollView, TextInput, Keyboard, BackHandler, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as Clipboard from 'expo-clipboard';
import { looksLikeUrl, validateAndNormalizeUrl } from '../../lib/url-validation';
import { useSaveBookmark } from '../../hooks/useSaveBookmark';
import { useQueryClient } from '@tanstack/react-query';
import { BookmarkPreview } from '../../components/BookmarkPreview';
import { useTheme } from '../../contexts/theme';

export default function AddBookmarkModal() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const urlInputRef = useRef<TextInput>(null);
  const [url, setUrl] = useState('');
  const [wasAutoPasted, setWasAutoPasted] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [hasCheckedClipboard, setHasCheckedClipboard] = useState(false);
  const { colors } = useTheme();
  
  // Use the save bookmark hook
  const {
    preview,
    isLoading: isLoadingPreview,
    isSaving,
    error: previewError,
    saveBookmark,
    updateUrl,
    retry,
    hasValidUrl,
  } = useSaveBookmark({ skipDebounce: wasAutoPasted });

  // Check clipboard on mount and auto-paste if valid URL
  useEffect(() => {
    const checkClipboard = async () => {
      try {
        // Check if clipboard has content
        const hasString = await Clipboard.hasStringAsync();
        if (!hasString) {
          setHasCheckedClipboard(true);
          return; // No content in clipboard
        }

        // Attempt to read clipboard content
        const text = await Clipboard.getStringAsync();
        if (!text || text.trim() === '') {
          setHasCheckedClipboard(true);
          return; // Empty or whitespace-only content
        }

        const trimmedText = text.trim();

        // More thorough validation before auto-paste
        if (looksLikeUrl(trimmedText)) {
          // Additional validation to ensure it's a proper URL
          const validation = validateAndNormalizeUrl(trimmedText);
          if (validation.isValid && validation.normalizedUrl) {
            // Auto-paste the validated URL
            setUrl(validation.normalizedUrl);
            setWasAutoPasted(true);
            // Immediately trigger preview for clipboard URLs
            updateUrl(validation.normalizedUrl, true);
            // Show auto-paste indicator briefly
            setTimeout(() => setWasAutoPasted(false), 3000);

            // Optional: Clear clipboard after successful paste for privacy
            // Uncomment the line below if you want to clear clipboard after paste
            // await Clipboard.setStringAsync('');
          }
        }
        setHasCheckedClipboard(true);
      } catch (err) {
        // Handle different types of clipboard errors
        if (err instanceof Error) {
          if (err.message.includes('permission') || err.message.includes('denied')) {
            console.log('Clipboard permission denied - skipping auto-paste');
          } else if (err.message.includes('not available')) {
            console.log('Clipboard not available on this device');
          } else {
            console.log('Clipboard read failed:', err.message);
          }
        } else {
          console.log('Unknown clipboard error:', err);
        }
        // Silently fail - don't show error to user for clipboard issues
        setHasCheckedClipboard(true);
      }
    };

    checkClipboard();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-focus input if no clipboard URL was found
  useEffect(() => {
    if (hasCheckedClipboard && !wasAutoPasted && urlInputRef.current) {
      // Small delay to ensure the component is fully mounted
      setTimeout(() => {
        urlInputRef.current?.focus();
      }, 100);
    }
  }, [hasCheckedClipboard, wasAutoPasted]);

  // Handle Android back button
  useEffect(() => {
    if (Platform.OS === 'android') {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        // Close modal on back button press
        handleClose();
        return true; // Prevent default behavior
      });

      return () => backHandler.remove();
    }
  }, []);

  const handleUrlChange = (text: string) => {
    setUrl(text);
    setHasInteracted(true);
    setWasAutoPasted(false);
    // Update URL in hook for debounced preview
    updateUrl(text);
  };

  const handleUrlSubmit = () => {
    // Dismiss keyboard when user presses return/done
    Keyboard.dismiss();
    // If we have a valid URL and preview, focus could move to save button
    // but for now just dismiss keyboard
  };

  const handleClose = useCallback(() => {
    // Simply go back to the previous screen
    router.back();
  }, [router]);

  const handleSave = useCallback(async () => {
    if (!hasValidUrl || isSaving) {
      return;
    }

    const saved = await saveBookmark();
    if (saved) {
      // Invalidate queries to refresh bookmark lists
      await queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      await queryClient.invalidateQueries({ queryKey: ['recent-bookmarks'] });

      // Close modal and go back to previous screen
      router.back();
    }
  }, [hasValidUrl, isSaving, saveBookmark, queryClient, router]);

  const handleRetry = useCallback(() => {
    retry();
  }, [retry]);

  // Memoize display error to prevent unnecessary re-renders
  const displayError = useMemo(() =>
    previewError && hasInteracted ? previewError : null,
    [previewError, hasInteracted]
  );

  return (
    <>
      {Platform.OS === 'ios' && <StatusBar barStyle="dark-content" />}
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          {/* Clean Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeButton}
              accessibilityLabel="Close add bookmark modal"
              accessibilityHint="Tap to close this modal and return to the previous screen"
              accessibilityRole="button"
            >
              <Feather name="x" size={28} color={colors.mutedForeground} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Add Bookmark</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {/* URL Input Section */}
            <View style={styles.inputSection}>
              <View style={styles.inputWrapper}>
                <View style={[styles.inputContainer, { 
                  backgroundColor: colors.secondary,
                  borderColor: displayError ? colors.destructive : colors.border
                }]}>
                  <Feather 
                    name="link" 
                    size={20} 
                    color={colors.mutedForeground} 
                    style={styles.inputIcon}
                  />
                  <TextInput
                    ref={urlInputRef}
                    style={[styles.input, { color: colors.foreground }]}
                    value={url}
                    onChangeText={handleUrlChange}
                    onSubmitEditing={handleUrlSubmit}
                    placeholder="Paste or enter URL"
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    returnKeyType="done"
                    accessibilityLabel="URL input field"
                    accessibilityHint="Enter the URL of the page you want to bookmark"
                    accessibilityRole="text"
                    accessibilityState={{ disabled: false }}
                  />
                  {isLoadingPreview && (
                    <ActivityIndicator 
                      size="small" 
                      color={colors.primary} 
                      style={styles.loadingIcon}
                    />
                  )}
                  {wasAutoPasted && (
                    <View style={[styles.autoPasteIndicator, { backgroundColor: colors.primary + '20' }]}>
                      <Feather name="clipboard" size={14} color={colors.primary} />
                    </View>
                  )}
                </View>
                {displayError && (
                  <Text style={[styles.errorText, { color: colors.destructive }]} accessibilityLiveRegion="polite">
                    <Feather name="alert-circle" size={12} /> {displayError}
                  </Text>
                )}
              </View>
            </View>

            {/* Preview Section */}
            {preview && (
              <View style={styles.previewSection}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Preview</Text>
                <View style={[styles.previewCard, { backgroundColor: colors.card }]}>
                  <BookmarkPreview 
                    preview={preview}
                    isLoading={isLoadingPreview}
                    error={displayError && !isLoadingPreview && !preview ? displayError : null}
                    onRetry={handleRetry}
                  />
                </View>
              </View>
            )}

            {/* Loading State */}
            {isLoadingPreview && !preview && (
              <View style={[styles.loadingContainer, { backgroundColor: colors.secondary }]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
                  Fetching preview...
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Bottom Action Bar */}
          {(preview || hasValidUrl) && (
            <View style={[styles.actionBar, { 
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              ...Platform.select({
                ios: {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: -2 },
                  shadowOpacity: 0.05,
                  shadowRadius: 10,
                },
                android: {
                  elevation: 10,
                },
              })
            }]}>
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  { 
                    backgroundColor: hasValidUrl && !isSaving ? colors.primary : colors.secondary,
                    opacity: hasValidUrl && !isSaving ? 1 : 0.6
                  }
                ]}
                onPress={handleSave}
                disabled={!hasValidUrl || isSaving}
                activeOpacity={0.8}
              >
                {isSaving ? (
                  <>
                    <ActivityIndicator size="small" color={colors.primaryForeground || '#fff'} />
                    <Text style={[styles.saveButtonText, { color: colors.primaryForeground || '#fff' }]}>
                      Saving...
                    </Text>
                  </>
                ) : (
                  <>
                    <Feather name="bookmark" size={20} color={colors.primaryForeground || '#fff'} />
                    <Text style={[styles.saveButtonText, { color: colors.primaryForeground || '#fff' }]}>
                      Save Bookmark
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: 4,
    marginLeft: -4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  placeholder: {
    width: 32,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingVertical: 20,
  },
  inputSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  inputWrapper: {
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  loadingIcon: {
    marginLeft: 8,
  },
  autoPasteIndicator: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  errorText: {
    fontSize: 13,
    marginTop: 8,
    marginLeft: 16,
    fontWeight: '500',
  },
  previewSection: {
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  previewCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  loadingContainer: {
    marginHorizontal: 20,
    paddingVertical: 40,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '500',
  },
  actionBar: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    gap: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
});
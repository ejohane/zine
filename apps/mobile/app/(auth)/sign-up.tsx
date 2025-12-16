/**
 * Sign Up Screen
 *
 * Handles new user registration with email/password and OAuth flows.
 */

import { useSignUp, useSSO } from '@clerk/clerk-expo';
import { Link, useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';

// ============================================================================
// Component
// ============================================================================

export default function SignUpScreen() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const { startSSOFlow } = useSSO();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Email/Password Sign Up
  // ---------------------------------------------------------------------------

  const handleSignUp = useCallback(async () => {
    if (!isLoaded || !signUp) return;

    setIsLoading(true);
    setError(null);

    try {
      await signUp.create({
        emailAddress: email,
        password,
      });

      // Send email verification code
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err: unknown) {
      console.error('[SignUp] Error:', err);
      const clerkError = err as { errors?: { message: string }[] };
      setError(clerkError.errors?.[0]?.message ?? 'Sign up failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded, signUp, email, password]);

  // ---------------------------------------------------------------------------
  // Email Verification
  // ---------------------------------------------------------------------------

  const handleVerification = useCallback(async () => {
    if (!isLoaded || !signUp) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: verificationCode,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        router.replace('/(tabs)');
      } else {
        console.log('[SignUp] Verification incomplete:', result.status);
        setError('Verification incomplete. Please try again.');
      }
    } catch (err: unknown) {
      console.error('[SignUp] Verification error:', err);
      const clerkError = err as { errors?: { message: string }[] };
      setError(clerkError.errors?.[0]?.message ?? 'Verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded, signUp, verificationCode, setActive, router]);

  // ---------------------------------------------------------------------------
  // OAuth Sign Up
  // ---------------------------------------------------------------------------

  const handleOAuthSignUp = useCallback(
    async (strategy: 'oauth_google' | 'oauth_apple') => {
      if (!startSSOFlow) return;

      setIsLoading(true);
      setError(null);

      try {
        const { createdSessionId, setActive: ssoSetActive } = await startSSOFlow({
          strategy,
        });

        if (createdSessionId && ssoSetActive) {
          await ssoSetActive({ session: createdSessionId });
          router.replace('/(tabs)');
        }
      } catch (err: unknown) {
        console.error('[SignUp] OAuth error:', err);
        const clerkError = err as { errors?: { message: string }[] };
        setError(clerkError.errors?.[0]?.message ?? 'OAuth sign up failed.');
      } finally {
        setIsLoading(false);
      }
    },
    [startSSOFlow, router]
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const styles = createStyles(colors);

  // Verification Code Screen
  if (pendingVerification) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <Text style={styles.title}>Check your email</Text>
              <Text style={styles.subtitle}>We sent a verification code to {email}</Text>
            </View>

            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Verification Code</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter 6-digit code"
                placeholderTextColor={colors.textTertiary}
                value={verificationCode}
                onChangeText={setVerificationCode}
                keyboardType="number-pad"
                maxLength={6}
                editable={!isLoading}
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
              onPress={handleVerification}
              disabled={isLoading || verificationCode.length < 6}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Verify Email</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setPendingVerification(false)}
            >
              <Text style={styles.secondaryButtonText}>Back</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Sign Up Form
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>Start your content journey</Text>
          </View>

          {/* Error Message */}
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Email Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="your@email.com"
              placeholderTextColor={colors.textTertiary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              editable={!isLoading}
            />
          </View>

          {/* Password Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Create a strong password"
              placeholderTextColor={colors.textTertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              editable={!isLoading}
            />
            <Text style={styles.hint}>At least 8 characters</Text>
          </View>

          {/* Sign Up Button */}
          <TouchableOpacity
            style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={isLoading || !email || password.length < 8}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* OAuth Buttons */}
          <View style={styles.oauthContainer}>
            <TouchableOpacity
              style={styles.oauthButton}
              onPress={() => handleOAuthSignUp('oauth_google')}
              disabled={isLoading}
            >
              <Text style={styles.oauthButtonText}>Google</Text>
            </TouchableOpacity>

            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={styles.oauthButton}
                onPress={() => handleOAuthSignUp('oauth_apple')}
                disabled={isLoading}
              >
                <Text style={styles.oauthButtonText}>Apple</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Sign In Link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/(auth)/sign-in" asChild>
              <TouchableOpacity>
                <Text style={styles.linkText}>Sign In</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ============================================================================
// Styles
// ============================================================================

function createStyles(colors: typeof Colors.light) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    keyboardView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: Spacing['2xl'],
      paddingTop: Spacing['4xl'],
      paddingBottom: Spacing['2xl'],
    },
    header: {
      marginBottom: Spacing['3xl'],
    },
    title: {
      ...Typography.displayMedium,
      color: colors.text,
      marginBottom: Spacing.sm,
    },
    subtitle: {
      ...Typography.bodyLarge,
      color: colors.textSecondary,
    },
    errorContainer: {
      backgroundColor: `${colors.error}15`,
      borderRadius: Radius.md,
      padding: Spacing.md,
      marginBottom: Spacing.lg,
    },
    errorText: {
      ...Typography.bodyMedium,
      color: colors.error,
    },
    inputContainer: {
      marginBottom: Spacing.lg,
    },
    label: {
      ...Typography.labelLarge,
      color: colors.text,
      marginBottom: Spacing.sm,
    },
    input: {
      ...Typography.bodyLarge,
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      color: colors.text,
    },
    hint: {
      ...Typography.bodySmall,
      color: colors.textTertiary,
      marginTop: Spacing.xs,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: Radius.md,
      paddingVertical: Spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: Spacing.sm,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    primaryButtonText: {
      ...Typography.titleMedium,
      color: '#FFFFFF',
    },
    secondaryButton: {
      backgroundColor: 'transparent',
      borderRadius: Radius.md,
      paddingVertical: Spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: Spacing.md,
    },
    secondaryButtonText: {
      ...Typography.titleMedium,
      color: colors.textSecondary,
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: Spacing['2xl'],
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    dividerText: {
      ...Typography.bodySmall,
      color: colors.textTertiary,
      paddingHorizontal: Spacing.md,
    },
    oauthContainer: {
      flexDirection: 'row',
      gap: Spacing.md,
    },
    oauthButton: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radius.md,
      paddingVertical: Spacing.md,
      alignItems: 'center',
    },
    oauthButtonText: {
      ...Typography.titleSmall,
      color: colors.text,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 'auto',
      paddingTop: Spacing['2xl'],
    },
    footerText: {
      ...Typography.bodyMedium,
      color: colors.textSecondary,
    },
    linkText: {
      ...Typography.titleSmall,
      color: colors.primary,
    },
  });
}

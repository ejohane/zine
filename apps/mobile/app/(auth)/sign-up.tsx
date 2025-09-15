import React from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator
} from 'react-native';
import { useSignUp } from '@clerk/clerk-expo';
import { Link, useRouter } from 'expo-router';

export default function SignUpScreen() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();

  const [emailAddress, setEmailAddress] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [pendingVerification, setPendingVerification] = React.useState(false);
  const [code, setCode] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  const onSignUpPress = async () => {
    if (!isLoaded) return;

    if (!emailAddress || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      await signUp.create({
        emailAddress,
        password,
      });

      // Send email verification code
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });

      setPendingVerification(true);
    } catch (err: any) {
      console.error('Sign up error:', err);
      Alert.alert('Error', err.errors?.[0]?.message || 'Failed to sign up');
    } finally {
      setIsLoading(false);
    }
  };

  const onPressVerify = async () => {
    if (!isLoaded) return;

    if (!code) {
      Alert.alert('Error', 'Please enter the verification code');
      return;
    }

    setIsLoading(true);

    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code,
      });

      if (completeSignUp.status === 'complete') {
        await setActive({ session: completeSignUp.createdSessionId });
        router.replace('/(tabs)');
      } else {
        console.error('Verification failed:', completeSignUp.status);
        Alert.alert('Error', 'Verification failed. Please try again.');
      }
    } catch (err: any) {
      console.error('Verification error:', err);
      Alert.alert('Error', err.errors?.[0]?.message || 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-white"
    >
      <ScrollView 
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 px-6 justify-center">
          {!pendingVerification ? (
            <>
              <View className="mb-8">
                <Text className="text-3xl font-bold text-gray-900 mb-2">Create Account</Text>
                <Text className="text-gray-600">Sign up to get started with Zine</Text>
              </View>

              <View className="space-y-4">
                <View>
                  <Text className="text-sm font-medium text-gray-700 mb-1">Email</Text>
                  <TextInput
                    autoCapitalize="none"
                    value={emailAddress}
                    placeholder="Enter your email"
                    placeholderTextColor="#9ca3af"
                    onChangeText={setEmailAddress}
                    keyboardType="email-address"
                    autoComplete="email"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base"
                  />
                </View>

                <View>
                  <Text className="text-sm font-medium text-gray-700 mb-1">Password</Text>
                  <TextInput
                    value={password}
                    placeholder="Create a password (min 8 chars)"
                    placeholderTextColor="#9ca3af"
                    secureTextEntry
                    onChangeText={setPassword}
                    autoComplete="password-new"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base"
                  />
                </View>

                <View>
                  <Text className="text-sm font-medium text-gray-700 mb-1">Confirm Password</Text>
                  <TextInput
                    value={confirmPassword}
                    placeholder="Confirm your password"
                    placeholderTextColor="#9ca3af"
                    secureTextEntry
                    onChangeText={setConfirmPassword}
                    autoComplete="password-new"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base"
                  />
                </View>

                <TouchableOpacity
                  onPress={onSignUpPress}
                  disabled={isLoading}
                  className={`w-full py-3 rounded-lg ${
                    isLoading ? 'bg-blue-400' : 'bg-blue-600'
                  }`}
                >
                  {isLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white text-center font-semibold text-base">
                      Sign Up
                    </Text>
                  )}
                </TouchableOpacity>

                <View className="flex-row justify-center mt-4">
                  <Text className="text-gray-600">Already have an account? </Text>
                  <Link href="/(auth)/sign-in" asChild>
                    <TouchableOpacity>
                      <Text className="text-blue-600 font-semibold">Sign In</Text>
                    </TouchableOpacity>
                  </Link>
                </View>
              </View>
            </>
          ) : (
            <>
              <View className="mb-8">
                <Text className="text-3xl font-bold text-gray-900 mb-2">Verify Email</Text>
                <Text className="text-gray-600">We've sent a code to {emailAddress}</Text>
              </View>

              <View className="space-y-4">
                <View>
                  <Text className="text-sm font-medium text-gray-700 mb-1">Verification Code</Text>
                  <TextInput
                    value={code}
                    placeholder="Enter 6-digit code"
                    placeholderTextColor="#9ca3af"
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    maxLength={6}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base text-center"
                  />
                </View>

                <TouchableOpacity
                  onPress={onPressVerify}
                  disabled={isLoading}
                  className={`w-full py-3 rounded-lg ${
                    isLoading ? 'bg-blue-400' : 'bg-blue-600'
                  }`}
                >
                  {isLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white text-center font-semibold text-base">
                      Verify Email
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
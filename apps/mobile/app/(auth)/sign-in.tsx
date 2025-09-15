// @ts-nocheck
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
import { useSignIn } from '@clerk/clerk-expo';
import { Link, useRouter } from 'expo-router';

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  
  const [emailAddress, setEmailAddress] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  const onSignInPress = async () => {
    if (!isLoaded) return;
    
    if (!emailAddress || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setIsLoading(true);
    
    try {
      const signInAttempt = await signIn.create({
        identifier: emailAddress,
        password,
      });

      if (signInAttempt.status === 'complete') {
        await setActive({ session: signInAttempt.createdSessionId });
        router.replace('/(tabs)');
      } else {
        // Handle additional steps if needed
        console.error('Sign in requires additional steps:', signInAttempt.status);
        Alert.alert('Error', 'Sign in requires additional verification');
      }
    } catch (err: any) {
      console.error('Sign in error:', err);
      Alert.alert('Error', err.errors?.[0]?.message || 'Failed to sign in');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: '#ffffff' }}
    >
      <ScrollView 
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center' }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <View style={{ marginBottom: 32 }}>
            <Text style={{ fontSize: 30, fontWeight: 'bold', color: '#111827', marginBottom: 8 }}>
              Sign In
            </Text>
            <Text style={{ fontSize: 16, color: '#6b7280' }}>
              Welcome back{'\n'}Sign in to your account to continue
            </Text>
          </View>

          <View style={{ gap: 16 }}>
            <View>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 4 }}>
                Email
              </Text>
              <TextInput
                autoCapitalize="none"
                value={emailAddress}
                placeholder="Enter your email"
                placeholderTextColor="#9ca3af"
                onChangeText={setEmailAddress}
                keyboardType="email-address"
                autoComplete="email"
                style={{
                  width: '100%',
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderWidth: 1,
                  borderColor: '#d1d5db',
                  borderRadius: 8,
                  fontSize: 16,
                  backgroundColor: '#ffffff'
                }}
              />
            </View>

            <View>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 4 }}>
                Password
              </Text>
              <TextInput
                value={password}
                placeholder="Enter your password"
                placeholderTextColor="#9ca3af"
                secureTextEntry
                onChangeText={setPassword}
                autoComplete="password"
                style={{
                  width: '100%',
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderWidth: 1,
                  borderColor: '#d1d5db',
                  borderRadius: 8,
                  fontSize: 16,
                  backgroundColor: '#ffffff'
                }}
              />
            </View>

            <TouchableOpacity
              onPress={onSignInPress}
              disabled={isLoading}
              style={{
                width: '100%',
                paddingVertical: 12,
                borderRadius: 8,
                backgroundColor: isLoading ? '#93c5fd' : '#2563eb',
                marginTop: 8
              }}
            >
              {isLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ color: '#ffffff', textAlign: 'center', fontWeight: '600', fontSize: 16 }}>
                  Sign In
                </Text>
              )}
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 16 }}>
              <Text style={{ color: '#6b7280' }}>Don't have an account? </Text>
              <Link href="/(auth)/sign-up" asChild>
                <TouchableOpacity>
                  <Text style={{ color: '#2563eb', fontWeight: '600' }}>Sign Up</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
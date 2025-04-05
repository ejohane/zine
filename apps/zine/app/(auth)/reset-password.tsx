import React, { useState } from 'react';
import { SafeAreaView, TouchableOpacity } from 'react-native';
import { useSignIn } from '@clerk/clerk-expo';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { VStack } from '@/components/ui/vstack';
import { FormControl, FormControlLabel, FormControlLabelText, FormControlError, FormControlErrorIcon, FormControlErrorText } from '@/components/ui/form-control';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonText } from '@/components/ui/button';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AlertCircleIcon } from '@/components/ui/icon';
import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const resetPasswordSchema = z.object({
  code: z.string().min(6, 'Verification code is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(8, 'Confirm password is required'),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ResetPasswordSchema = z.infer<typeof resetPasswordSchema>;

export default function ResetPassword() {
  const router = useRouter();
  const { isLoaded, signIn, setActive } = useSignIn();
  const params = useLocalSearchParams();
  
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState('');
  const [verificationStarted, setVerificationStarted] = useState(false);

  const {
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ResetPasswordSchema>({
    mode: 'onChange',
    resolver: zodResolver(resetPasswordSchema),
  });

  // Get the email from params
  const email = params.email as string;

  // Handle reset password with verification code
  const onSubmit = async (data: ResetPasswordSchema) => {
    if (!isLoaded || !email) return;
    
    setIsResetting(true);
    setError('');

    try {
      try {
        const result = await signIn.attemptFirstFactor({
          strategy: 'reset_password_email_code',
          code: data.code,
          password: data.password,
        });
        
        if (result.status === 'complete') {
          try {
            console.log("Password reset complete, setting active session");
            // Try to set active session
            await setActive({ session: result.createdSessionId });
            console.log("Session activated after reset, redirecting");
            
            // Force reload the app to ensure auth state is refreshed
            setTimeout(() => {
              router.replace('/');
            }, 500);
          } catch (sessionErr: any) {
            console.log("Session error after reset:", sessionErr);
            
            // If we get a session_exists error, just redirect the user
            if (sessionErr.errors?.[0]?.code === "session_exists") {
              console.log("Session already exists after reset, redirecting");
              router.replace('/');
            } else {
              throw sessionErr;
            }
          }
        }
      } catch (factorErr: any) {
        // Handle specific factor attempt errors
        throw factorErr;
      }
    } catch (err: any) {
      console.error('Error resetting password:', err);
      setError(err.errors?.[0]?.message || 'Failed to reset password');
    } finally {
      setIsResetting(false);
    }
  };

  // Start the verification process by sending a code to the email
  const startVerification = async () => {
    if (!isLoaded || !email) return;
    
    setIsResetting(true);
    setError('');

    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email,
      });
      setVerificationStarted(true);
    } catch (err: any) {
      console.error('Error sending verification code:', err);
      setError(err.errors?.[0]?.message || 'Failed to send verification code');
    } finally {
      setIsResetting(false);
    }
  };

  // Start verification when component loads if email is available
  React.useEffect(() => {
    if (email && !verificationStarted) {
      startVerification();
    }
  }, [email, verificationStarted]);

  return (
    <SafeAreaView>
      <Box className="p-4">
        <VStack className="max-w-[440px] w-full" space="md">
          <VStack className="md:items-center" space="md">
            <VStack>
              <Heading className="md:text-center" size="3xl">
                Reset Password
              </Heading>
              <Text>
                {verificationStarted 
                  ? `Enter the verification code sent to ${email}` 
                  : "Please wait while we send you a verification code..."}
              </Text>
            </VStack>
          </VStack>

          {/* Show error message if there was an error */}
          {error && (
            <Box className="p-3 bg-red-100 rounded-md mb-4">
              <Text className="text-red-800">{error}</Text>
            </Box>
          )}

          {verificationStarted && (
            <VStack className="w-full">
              <VStack space="xl" className="w-full">
                <FormControl isInvalid={!!errors.code} className="w-full">
                  <FormControlLabel>
                    <FormControlLabelText>Verification Code</FormControlLabelText>
                  </FormControlLabel>
                  <Input>
                    <Controller
                      name="code"
                      defaultValue=""
                      control={control}
                      render={({ field: { onChange, onBlur, value } }) => (
                        <InputField
                          className="text-sm"
                          placeholder="Enter code from email"
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          returnKeyType="next"
                        />
                      )}
                    />
                  </Input>
                  {errors.code && (
                    <FormControlError>
                      <FormControlErrorIcon as={AlertCircleIcon} />
                      <FormControlErrorText>
                        {errors.code.message}
                      </FormControlErrorText>
                    </FormControlError>
                  )}
                </FormControl>

                <FormControl isInvalid={!!errors.password} className="w-full">
                  <FormControlLabel>
                    <FormControlLabelText>New Password</FormControlLabelText>
                  </FormControlLabel>
                  <Input>
                    <Controller
                      name="password"
                      defaultValue=""
                      control={control}
                      render={({ field: { onChange, onBlur, value } }) => (
                        <InputField
                          className="text-sm"
                          placeholder="New password"
                          type="password"
                          secureTextEntry
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          returnKeyType="next"
                        />
                      )}
                    />
                  </Input>
                  {errors.password && (
                    <FormControlError>
                      <FormControlErrorIcon as={AlertCircleIcon} />
                      <FormControlErrorText>
                        {errors.password.message}
                      </FormControlErrorText>
                    </FormControlError>
                  )}
                </FormControl>

                <FormControl isInvalid={!!errors.confirmPassword} className="w-full">
                  <FormControlLabel>
                    <FormControlLabelText>Confirm Password</FormControlLabelText>
                  </FormControlLabel>
                  <Input>
                    <Controller
                      name="confirmPassword"
                      defaultValue=""
                      control={control}
                      render={({ field: { onChange, onBlur, value } }) => (
                        <InputField
                          className="text-sm"
                          placeholder="Confirm new password"
                          type="password"
                          secureTextEntry
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          returnKeyType="done"
                        />
                      )}
                    />
                  </Input>
                  {errors.confirmPassword && (
                    <FormControlError>
                      <FormControlErrorIcon as={AlertCircleIcon} />
                      <FormControlErrorText>
                        {errors.confirmPassword.message}
                      </FormControlErrorText>
                    </FormControlError>
                  )}
                </FormControl>
              </VStack>

              <VStack className="w-full my-7" space="lg">
                <Button
                  className="w-full"
                  onPress={handleSubmit(onSubmit)}
                  disabled={isResetting}
                >
                  <ButtonText className="font-medium">
                    {isResetting ? "Resetting..." : "Reset Password"}
                  </ButtonText>
                </Button>

                <TouchableOpacity onPress={() => router.replace('/login')}>
                  <Text className="text-center text-blue-600">Back to Sign In</Text>
                </TouchableOpacity>
              </VStack>
            </VStack>
          )}
        </VStack>
      </Box>
    </SafeAreaView>
  );
}
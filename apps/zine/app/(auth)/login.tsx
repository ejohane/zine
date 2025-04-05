import { Box } from "@/components/ui/box";
import { Text } from "@/components/ui/text";
import { Heading } from "@/components/ui/heading";
import { VStack } from "@/components/ui/vstack";
import { HStack } from "@/components/ui/hstack";
import { useSignIn, useClerk } from "@clerk/clerk-expo";
import { SafeAreaView, TouchableOpacity } from "react-native";
import { z } from "zod";
import {
  FormControl,
  FormControlError,
  FormControlErrorIcon,
  FormControlErrorText,
  FormControlLabel,
  FormControlLabelText,
} from "@/components/ui/form-control";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input, InputField } from "@/components/ui/input";
import { AlertCircleIcon } from "@/components/ui/icon";
import { useRouter, Link } from "expo-router";
import { Button, ButtonText } from "@/components/ui/button";
import { useState } from "react";

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});
type SignInSchema = z.infer<typeof signInSchema>;

export default function SignIn() {
  const router = useRouter();
  const { isLoaded, signIn, setActive } = useSignIn();
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const {
    handleSubmit,
    control,
    formState: { errors, isValid },
    watch,
  } = useForm<SignInSchema>({
    mode: "onChange",
    resolver: zodResolver(signInSchema),
  });
  
  // Get the current email value from the form
  const emailValue = watch("email", "");

  const onSubmit = async (data: SignInSchema) => {
    if (!isValid || !isLoaded) return;

    console.log("Attempting sign in with:", data.email);
    
    try {
      // Try to create a new sign in
      try {
        const signInAttempt = await signIn.create({
          identifier: data.email,
          password: data.password,
        });

        console.log("Sign in attempt result:", signInAttempt);

        // If sign-in process is complete, set the created session as active
        if (signInAttempt.status === "complete") {
          console.log("Sign in complete, setting active session");
          await setActive({ session: signInAttempt.createdSessionId });
          console.log("Session activated, redirecting to home");
          
          // Force reload the app to ensure auth state is refreshed
          setTimeout(() => {
            router.replace("/");
          }, 500);
        } else {
          // If the status isn't complete, check why. User might need to
          // complete further steps.
          console.error("Sign in incomplete:", JSON.stringify(signInAttempt, null, 2));
        }
      } catch (signInErr: any) {
        console.log("Sign in error:", signInErr);
        
        // Check if the error is due to an existing session
        if (signInErr.errors?.[0]?.code === "session_exists") {
          console.log("Session already exists, redirecting to home");
          // User already has an active session, just redirect them
          router.replace("/");
        } else {
          // Rethrow for the outer catch to handle
          throw signInErr;
        }
      }
    } catch (err: any) {
      // General error handling
      console.error("Sign in error:", JSON.stringify(err, null, 2));
      // Display error to user
      setResetPasswordError(err.errors?.[0]?.message || "Failed to sign in. Please try again.");
    }
  };

  const onInvalid = (errors: any) => console.log(errors);

  // Handle forgot password
  const handleForgotPassword = async () => {
    if (!isLoaded) return;

    // Use existing email from form if available
    const emailToReset = emailValue || forgotPasswordEmail;
    
    if (!emailToReset) {
      setResetPasswordError("Please enter an email address");
      return;
    }

    setIsResettingPassword(true);
    setResetPasswordError("");

    try {
      // Send reset email
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: emailToReset,
      });

      // Navigate to reset password page
      router.push({
        pathname: "/reset-password",
        params: { email: emailToReset }
      });
    } catch (err: any) {
      console.error("Error sending reset email:", err);
      setResetPasswordError(err.errors?.[0]?.message || "Failed to send reset email");
      setIsResettingPassword(false);
    }
  };

  // Toggle forgot password form
  const toggleForgotPassword = () => {
    setShowForgotPassword(!showForgotPassword);
    setResetPasswordSuccess(false);
    setResetPasswordError("");
  };

  return (
    <SafeAreaView>
      <Box className="p-4">
        <VStack className="max-w-[440px] w-full" space="md">
          <VStack className="md:items-center" space="md">
            <VStack>
              <Heading className="md:text-center" size="3xl">
                {showForgotPassword ? "Reset Password" : "Sign In"}
              </Heading>
              <Text>
                {showForgotPassword 
                  ? "Enter your email to receive a password reset link" 
                  : "Sign in to start using zine"}
              </Text>
            </VStack>
          </VStack>

          {/* Show success message if password reset email was sent */}
          {resetPasswordSuccess && (
            <Box className="p-3 bg-green-100 rounded-md mb-4">
              <Text className="text-green-800">
                Password reset email sent. Please check your inbox.
              </Text>
            </Box>
          )}

          {/* Show error message if there was an error */}
          {resetPasswordError && (
            <Box className="p-3 bg-red-100 rounded-md mb-4">
              <Text className="text-red-800">{resetPasswordError}</Text>
            </Box>
          )}

          {showForgotPassword ? (
            // Forgot Password Form
            <VStack className="w-full">
              <VStack space="xl" className="w-full">
                <FormControl className="w-full">
                  <FormControlLabel>
                    <FormControlLabelText>Email</FormControlLabelText>
                  </FormControlLabel>
                  <Input>
                    <InputField
                      className="text-sm"
                      placeholder="Email"
                      type="text"
                      value={forgotPasswordEmail}
                      onChangeText={setForgotPasswordEmail}
                      returnKeyType="done"
                    />
                  </Input>
                </FormControl>
              </VStack>

              <VStack className="w-full my-7" space="lg">
                <Button
                  className="w-full"
                  onPress={handleForgotPassword}
                  disabled={isResettingPassword || resetPasswordSuccess}
                >
                  <ButtonText className="font-medium">
                    {isResettingPassword ? "Sending..." : "Reset Password"}
                  </ButtonText>
                </Button>
                
                <TouchableOpacity onPress={toggleForgotPassword}>
                  <Text className="text-center text-blue-600">Back to Sign In</Text>
                </TouchableOpacity>
              </VStack>
            </VStack>
          ) : (
            // Normal Sign In Form
            <VStack className="w-full">
              <VStack space="xl" className="w-full">
                <FormControl isInvalid={!!errors.email} className="w-full">
                  <FormControlLabel>
                    <FormControlLabelText>Email</FormControlLabelText>
                  </FormControlLabel>
                  <Input>
                    <Controller
                      name="email"
                      defaultValue=""
                      control={control}
                      render={({ field: { onChange, onBlur, value } }) => (
                        <InputField
                          className="text-sm"
                          placeholder="Email"
                          type="text"
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          returnKeyType="done"
                        />
                      )}
                    />
                  </Input>
                  {errors.email && (
                    <FormControlError>
                      <FormControlErrorIcon as={AlertCircleIcon} />
                      <FormControlErrorText>
                        {errors.email.message}
                      </FormControlErrorText>
                    </FormControlError>
                  )}
                </FormControl>

                <FormControl isInvalid={!!errors.password} className="w-full">
                  <FormControlLabel>
                    <FormControlLabelText>Password</FormControlLabelText>
                  </FormControlLabel>
                  <Input>
                    <Controller
                      name="password"
                      defaultValue=""
                      control={control}
                      render={({ field: { onChange, onBlur, value } }) => (
                        <InputField
                          className="text-sm"
                          placeholder="Password"
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
                  {errors.password && (
                    <FormControlError>
                      <FormControlErrorIcon as={AlertCircleIcon} />
                      <FormControlErrorText>
                        {errors.password.message}
                      </FormControlErrorText>
                    </FormControlError>
                  )}
                </FormControl>
                
                {/* Forgot Password Link */}
                <TouchableOpacity onPress={toggleForgotPassword}>
                  <Text className="text-right text-blue-600">Forgot Password?</Text>
                </TouchableOpacity>
              </VStack>

              <VStack className="w-full my-7" space="lg">
                <Button
                  className="w-full"
                  onPress={handleSubmit(onSubmit, onInvalid)}
                >
                  <ButtonText className="font-medium">Sign In</ButtonText>
                </Button>
                
                <HStack className="justify-center" space="sm">
                  <Text>Don't have an account?</Text>
                  <Link href="/signup" asChild>
                    <TouchableOpacity>
                      <Text className="text-blue-600">Sign Up</Text>
                    </TouchableOpacity>
                  </Link>
                </HStack>
              </VStack>
            </VStack>
          )}
        </VStack>
      </Box>
    </SafeAreaView>
  );
}


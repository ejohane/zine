import React from "react";
import { useSignUp } from "@clerk/clerk-expo";
import { router } from "expo-router";
import { Input, InputField } from "@/components/ui/input";
import { Button, ButtonText } from "@/components/ui/button";
import { Box } from "@/components/ui/box";
import {
  FormControl,
  FormControlError,
  FormControlErrorIcon,
  FormControlErrorText,
  FormControlLabel,
  FormControlLabelText,
} from "@/components/ui/form-control";
import { Heading } from "@/components/ui/heading";
import { VStack } from "@/components/ui/vstack";
import { Text } from "@/components/ui/text";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { z } from "zod";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon } from "@/components/ui/icon";

const signUpSchema = z
  .object({
    email: z.string().email(),
    password: z.string(),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"], // path of error
  });
type SignUpSchema = z.infer<typeof signUpSchema>;

export default function SignUpScreen() {
  const { isLoaded, signUp, setActive } = useSignUp();

  const {
    handleSubmit,
    control,
    formState: { errors, isValid },
  } = useForm<SignUpSchema>({
    mode: "onChange",
    resolver: zodResolver(signUpSchema),
  });

  const onSubmit = async (data: SignUpSchema) => {
    if (!isValid || !isLoaded) return;

    try {
      const result = await signUp.create({
        emailAddress: data.email,
        password: data.password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });

        setTimeout(() => {
          router.replace("/");
        }, 500);
      } else {
        // If the status isn't complete, check why. User might need to
        // complete further steps.
        console.error("Sign up incomplete:", JSON.stringify(result, null, 2));
      }
    } catch (err: any) {
      console.log("Sign in error:", err);

      // Check if the error is due to an existing session
      if (err.errors?.[0]?.code === "session_exists") {
        console.log("Session already exists, redirecting to home");
        // User already has an active session, just redirect them
        router.replace("/");
      } else {
        // Rethrow for the outer catch to handle
        console.error("Sign up error:", JSON.stringify(err, null, 2));
      }
    }
  };

  const onInvalid = (errors: any) => console.log(errors);

  return (
    <SafeAreaView>
      <Box className="p-4">
        <VStack className="max-w-[440px] w-full" space="md">
          <VStack className="md:items-center" space="md">
            <VStack>
              <Heading className="md:text-center" size="3xl">
                Sign Up
              </Heading>
              <Text>Sign up to start using zine</Text>
            </VStack>
          </VStack>

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

              <FormControl
                isInvalid={!!errors.confirmPassword}
                className="w-full"
              >
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
                onPress={handleSubmit(onSubmit, onInvalid)}
              >
                <ButtonText className="font-medium">Sign Up</ButtonText>
              </Button>
            </VStack>
          </VStack>
        </VStack>
      </Box>
    </SafeAreaView>
  );
}


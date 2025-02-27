import { Box } from "@/components/ui/box";
import { Text } from "@/components/ui/text";
import { Heading } from "@/components/ui/heading";
import { VStack } from "@/components/ui/vstack";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { SafeAreaView } from "react-native";
import { z } from "zod";
import {
  FormControl,
  FormControlError,
  FormControlErrorIcon,
  FormControlErrorText,
  FormControlLabel,
  FormControlLabelText,
} from "@/components/ui/form-control";
import { Input, InputField } from "@/components/ui/input";
import { Button, ButtonText } from "@/components/ui/button";
import { AlertCircleIcon } from "@/components/ui/icon";
import { useSignUp } from "@clerk/clerk-expo";
import React, { useState } from "react";
import { useRouter } from "expo-router";

const signUpFormSchema = z
  .object({
    email: z.string().email(),
    password: z.string(),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords must match",
    path: ["confirmPassword"],
  });
type SignUpFormSchema = z.infer<typeof signUpFormSchema>;

export default function SignUp() {
  const router = useRouter();
  const { isLoaded, signUp, setActive } = useSignUp();
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState<string>("");

  const {
    handleSubmit,
    control,
    formState: { errors, isValid },
  } = useForm<SignUpFormSchema>({
    mode: "onChange",
    resolver: zodResolver(signUpFormSchema),
  });

  const onSubmit = async (data: SignUpFormSchema) => {
    if (!isValid || !isLoaded) return;

    try {
      await signUp.create({
        emailAddress: data.email,
        password: data.password,
      });

      await signUp.prepareEmailAddressVerification({
        strategy: "email_code",
      });

      setPendingVerification(true);
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
    }
  };

  const onInvalid = (errors: any) => console.log(errors);

  const onVerifyPress = async () => {
    if (!isLoaded) return;

    try {
      const signUpAttempt = await signUp.attemptEmailAddressVerification({
        code,
      });

      if (signUpAttempt.status === "complete") {
        await setActive({ session: signUpAttempt.createdSessionId });
        router.replace("/");
      } else {
        // If the status is not complete, check why. User may need to
        // complete further steps.
        console.error(JSON.stringify(signUpAttempt, null, 2));
      }
    } catch (err) {
      // See https://clerk.com/docs/custom-flows/error-handling
      // for more info on error handling
      console.error(JSON.stringify(err, null, 2));
    }
  };

  if (pendingVerification) {
    return (
      <SafeAreaView>
        <Box className="p-4">
          <VStack className="max-w-[440px] w-full" space="md">
            <VStack className="md:items-center" space="md">
              <VStack>
                <Heading className="md:text-center" size="3xl">
                  Verify your email
                </Heading>
              </VStack>
            </VStack>
            <Input>
              <InputField
                value={code}
                onChangeText={(code) => setCode(code)}
                placeholder="Enter your verification code"
              />
            </Input>
            <Button onPress={onVerifyPress}>
              <ButtonText className="font-medium">Verify</ButtonText>
            </Button>
          </VStack>
        </Box>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView>
      <Box className="p-4">
        <VStack className="max-w-[440px] w-full" space="md">
          <VStack className="md:items-center" space="md">
            <VStack>
              <Heading className="md:text-center" size="3xl">
                Sign Up
              </Heading>
              <Text>Sign up to start using gluestack</Text>
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
                        // onSubmitEditing={handleKeyPress}
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
                        type="text"
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        // onSubmitEditing={handleKeyPress}
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
                        placeholder="Confirm Password"
                        type="text"
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

            <VStack className="w-full my-7 " space="lg">
              {/* <Button className="w-full" onPress={form.handleSubmit(onSubmit)}> */}
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

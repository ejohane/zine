import { Box } from "@/components/ui/box";
import { Text } from "@/components/ui/text";
import { Heading } from "@/components/ui/heading";
import { VStack } from "@/components/ui/vstack";
import { useSignIn } from "@clerk/clerk-expo";
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
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input, InputField } from "@/components/ui/input";
import { AlertCircleIcon } from "@/components/ui/icon";
import { useRouter } from "expo-router";
import { Button, ButtonText } from "@/components/ui/button";

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});
type SignInSchema = z.infer<typeof signInSchema>;

export default function SignIn() {
  const router = useRouter();
  const { isLoaded, signIn, setActive } = useSignIn();

  const {
    handleSubmit,
    control,
    formState: { errors, isValid },
  } = useForm<SignInSchema>({
    mode: "onChange",
    resolver: zodResolver(signInSchema),
  });

  const onSubmit = async (data: SignInSchema) => {
    if (!isValid || !isLoaded) return;

    try {
      const signInAttempt = await signIn.create({
        identifier: data.email,
        password: data.password,
      });

      // If sign-in process is complete, set the created session as active
      // and redirect the user
      if (signInAttempt.status === "complete") {
        await setActive({ session: signInAttempt.createdSessionId });
        router.replace("/");
      } else {
        // If the status isn't complete, check why. User might need to
        // complete further steps.
        console.error(JSON.stringify(signInAttempt, null, 2));
      }
    } catch (err) {
      // See https://clerk.com/docs/custom-flows/error-handling
      // for more info on error handling
      console.error(JSON.stringify(err, null, 2));
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
                Sign In
              </Heading>
              <Text>Sign in to start using zine</Text>
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
                        type="text"
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
            </VStack>

            <VStack className="w-full my-7 " space="lg">
              <Button
                className="w-full"
                onPress={handleSubmit(onSubmit, onInvalid)}
              >
                <ButtonText className="font-medium">Sign In</ButtonText>
              </Button>
            </VStack>
          </VStack>
        </VStack>
      </Box>
    </SafeAreaView>
  );
}

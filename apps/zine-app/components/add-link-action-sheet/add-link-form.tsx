import {
  Actionsheet,
  ActionsheetBackdrop,
  ActionsheetContent,
  ActionsheetDragIndicator,
  ActionsheetDragIndicatorWrapper,
} from "../ui/actionsheet";
import { KeyboardAvoidingView } from "../ui/keyboard-avoiding-view";
import { Platform } from "react-native";

import { useState } from "react";
import {
  FormControl,
  FormControlError,
  FormControlErrorIcon,
  FormControlErrorText,
  FormControlLabel,
  FormControlLabelText,
} from "../ui/form-control";
import { Input, InputField } from "../ui/input";
import { AlertCircleIcon } from "../ui/icon";
import { Button, ButtonText } from "../ui/button";
import { z } from "zod";
import { NativeSyntheticEvent, TextInputChangeEventData } from "react-native";
import { Box } from "../ui/box";
import { Text } from "../ui/text";
import { Keyboard } from "react-native";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { useContent } from "@/hooks/use-content";

const urlSchema = z.string().url();
interface AddLinkActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
}
export const AddLinkActionForm = ({
  isOpen,
  onClose,
}: AddLinkActionSheetProps) => {
  const { saveBookmark } = useBookmarks();
  const { preview } = useContent();
  const [url, setUrl] = useState("");
  const [isInvalid, setIsInvalid] = useState(false);
  const [title, setTitle] = useState<string>();

  const handleChange = (
    event: NativeSyntheticEvent<TextInputChangeEventData>,
  ) => {
    const url = event.nativeEvent.text;
    const result = urlSchema.safeParse(url);
    setUrl(url);
    if (result.success) {
      setIsInvalid(false);
    } else {
      setIsInvalid(true);
    }
  };

  const handleClose = () => {
    Keyboard.dismiss();
    setUrl("");
    setIsInvalid(false);
    onClose();
  };

  const handleSubmit = async () => {
    saveBookmark(url);
    // const response = await preview(url);
    // setTitle(response.title);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <Actionsheet isOpen={isOpen} onClose={handleClose} snapPoints={[70]}>
        <ActionsheetBackdrop />
        <ActionsheetContent className="max-h-[75%] overflow-y-auto">
          <ActionsheetDragIndicatorWrapper>
            <ActionsheetDragIndicator />
          </ActionsheetDragIndicatorWrapper>
          <Box className="w-full p-4">
            <Text className="text-lg font-bold mb-4">Add URL</Text>
            <FormControl isInvalid={isInvalid}>
              <FormControlLabel>
                <FormControlLabelText>URL</FormControlLabelText>
              </FormControlLabel>
              <Input>
                <InputField
                  autoFocus={isOpen}
                  placeholder="url"
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={url}
                  onChange={handleChange}
                />
              </Input>
              <FormControlError>
                <FormControlErrorIcon as={AlertCircleIcon} />
                <FormControlErrorText>Invalid URL</FormControlErrorText>
              </FormControlError>
            </FormControl>
            <Text>{title}</Text>
            <Box className="w-full pt-4">
              <Button
                isDisabled={isInvalid || url === ""}
                className=""
                size="lg"
                onPress={handleSubmit}
              >
                <ButtonText>Submit</ButtonText>
              </Button>
            </Box>
          </Box>
        </ActionsheetContent>
      </Actionsheet>
    </KeyboardAvoidingView>
  );
};

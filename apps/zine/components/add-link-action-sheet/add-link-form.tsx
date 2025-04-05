import { z } from "zod";
import * as Clipboard from "expo-clipboard";
import {
  Box,
  Text,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  Input,
  InputField,
  FormControlError,
  FormControlErrorIcon,
  FormControlErrorText,
  Button,
  ButtonText,
  AlertCircleIcon,
} from "../ui";
import { AddLinkActionButon } from "./add-link-action-button";
import { useEffect, useState } from "react";
import { useBookmarks } from "@/bookmarks";
import { Content, useContent } from "@/content";
import {
  Keyboard,
  NativeSyntheticEvent,
  TextInputChangeEventData,
} from "react-native";

const urlSchema = z.string().url();

export const AddLinkForm = () => {
  const { saveBookmark } = useBookmarks();
  const { preview, isPending } = useContent();
  const [url, setUrl] = useState("");
  const [isInvalid, setIsInvalid] = useState(false);
  const [previewContent, setPreviewContent] = useState<Content>();
  const [previewError, setPreviewError] = useState<boolean>(false);
  const [title, setTitle] = useState<string>();

  useEffect(() => {
    Clipboard.getStringAsync().then((content) => {
      const result = urlSchema.safeParse(content);
      if (result.success) {
        setUrl(content);
        handleSubmit(content);
      }
    });
  }, []);

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
    // onClose();
  };

  const handleSubmit = async (item: string) => {
    try {
      const result = await preview(item);
      setPreviewContent(result);
    } catch (error) {
      setPreviewError(true);
    }
  };

  const handleSave = async () => {
    if (!previewContent) return;
    saveBookmark(previewContent);
    setPreviewContent(undefined);
    handleClose();
  };
  return (
    <Box className="w-full p-4">
      <Text className="text-lg font-bold mb-4">Add URL</Text>
      <FormControl isInvalid={isInvalid}>
        <FormControlLabel>
          <FormControlLabelText>URL</FormControlLabelText>
        </FormControlLabel>
        <Input>
          <InputField
            autoFocus={true}
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
      {previewError && (
        <Text className="text-red-500">Something went wrong</Text>
      )}
      <AddLinkActionButon
        isPending={isPending}
        isInvalid={isInvalid}
        url={url}
        previewContent={previewContent}
        handleSubmit={handleSubmit}
        handleSave={handleSave}
      />
    </Box>
  );
};

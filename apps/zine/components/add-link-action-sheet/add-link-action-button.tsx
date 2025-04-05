import { Content } from "@/content";
import { Box, Button, ButtonSpinner, ButtonText } from "../ui";
import colors from "tailwindcss/colors";

type ActionButtonProps = {
  isPending: boolean;
  isInvalid: boolean;
  previewContent?: Content;
  url: string;
  handleSubmit: (url: string) => void;
  handleSave: () => void;
};

export const AddLinkActionButon = ({
  isPending,
  isInvalid,
  url,
  previewContent,
  handleSubmit,
  handleSave,
}: ActionButtonProps) => {
  const saveEnabled = previewContent !== undefined;
  const buttonText = saveEnabled ? "Save" : "Preview";

  const button = isPending ? (
    <Button className="p-3" isDisabled>
      <ButtonSpinner color={colors.gray[400]} />
    </Button>
  ) : (
    <Button
      isDisabled={isInvalid || url === "" || isPending}
      className=""
      size="xl"
      onPress={saveEnabled ? handleSave : () => handleSubmit(url)}
    >
      <ButtonText>{buttonText}</ButtonText>
    </Button>
  );

  return <Box className="w-full pt-4">{button}</Box>;
};

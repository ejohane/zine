import { useColorScheme } from "@/components/useColorScheme";
import { FC } from "react";
import RNActionSheet, { ActionSheetProps } from "react-native-actions-sheet";
import colors from "tailwindcss/colors";

export const ActionSheet: FC<ActionSheetProps> = ({ children, ...props }) => {
  const colorScheme = useColorScheme();

  const backgroundColor =
    colorScheme === "dark" ? colors.gray["900"] : colors.white;

  return (
    <RNActionSheet containerStyle={{ backgroundColor }} {...props}>
      {children}
    </RNActionSheet>
  );
};

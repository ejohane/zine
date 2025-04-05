import { ActionSheet, SafeAreaView } from "../ui";
import { AddLinkForm } from "./add-link-form";

export const AddLinkActionSheet = () => {
  return (
    <ActionSheet snapPoints={[50]} gestureEnabled>
      <SafeAreaView className="h-full">
        <AddLinkForm />
      </SafeAreaView>
    </ActionSheet>
  );
};

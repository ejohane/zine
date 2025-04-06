import { ActionSheet, SafeAreaView } from "../ui";
import { Box } from "../ui/box";
import { Text } from "../ui/text";
import { Input, InputField } from "../ui/input";
import { Button } from "../ui/button";
import { useState } from "react";
import * as Haptics from 'expo-haptics';
import { SheetManager } from "react-native-actions-sheet";

interface AddTagActionSheetProps {
  payload?: {
    onAddTag: (tagName: string) => void;
  };
}

export const AddTagActionSheet = ({ payload }: AddTagActionSheetProps) => {
  const [newTagName, setNewTagName] = useState("");

  const handleTagSubmit = () => {
    if (newTagName.trim() && payload?.onAddTag) {
      payload.onAddTag(newTagName.trim());
      setNewTagName("");
      SheetManager.hide("add-tag");
    }
  };

  const handleCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNewTagName("");
    SheetManager.hide("add-tag");
  };

  return (
    <ActionSheet snapPoints={[50]} gestureEnabled>
      <SafeAreaView className="h-full">
        <Box className="p-5">
          <Text className="text-xl font-semibold mb-4">Add New Tag</Text>
          
          <Input className="bg-background-100 rounded-lg mb-4">
            <InputField
              placeholder="Enter tag name"
              value={newTagName}
              onChangeText={setNewTagName}
              autoFocus
            />
          </Input>
          
          <Box className="flex-row justify-end gap-3">
            <Button
              variant="outline"
              onPress={handleCancel}
            >
              <Text className="text-background-700">Cancel</Text>
            </Button>
            
            <Button
              onPress={handleTagSubmit}
              disabled={!newTagName.trim()}
            >
              <Text className="text-background-0 font-medium">Add</Text>
            </Button>
          </Box>
        </Box>
      </SafeAreaView>
    </ActionSheet>
  );
}; 
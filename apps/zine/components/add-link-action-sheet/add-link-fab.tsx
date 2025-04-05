import { SheetManager } from "react-native-actions-sheet";
import { Fab, FabIcon } from "../ui/fab";
import { AddIcon } from "../ui/icon";

export const AddLinkFab = () => {
  return (
    <Fab
      size="lg"
      placement="bottom right"
      onPress={() => SheetManager.show("add-link")}
    >
      <FabIcon as={AddIcon} />
    </Fab>
  );
};

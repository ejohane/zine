import { useState } from "react";
import { Fab, FabIcon } from "../ui/fab";
import { AddLinkActionForm } from "./add-link-form";
import { AddIcon } from "../ui/icon";

export const AddLinkActionSheet = () => {
  const [isAddSheetOpen, setAddSheetOpen] = useState(false);

  return (
    <>
      <Fab
        size="lg"
        placement="bottom right"
        onPress={() => setAddSheetOpen(!isAddSheetOpen)}
      >
        <FabIcon as={AddIcon} />
      </Fab>
      <AddLinkActionForm
        isOpen={isAddSheetOpen}
        onClose={() => setAddSheetOpen(false)}
      />
    </>
  );
};

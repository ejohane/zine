import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Fab, FabIcon } from "@/components/ui/fab";
import { AddIcon } from "@/components/ui/icon";
import { useState } from "react";
import { AddLinkActionSheet } from "@/components/add-link-action-sheet";

export default function Home() {
  const [isAddSheetOpen, setAddSheetOpen] = useState(false);

  return (
    <SafeAreaView className="w-full h-full">
      {/* <Box> */}
      {/*   <Button */}
      {/*     size="md" */}
      {/*     variant="solid" */}
      {/*     action="primary" */}
      {/*     onPress={() => auth.signOut()} */}
      {/*   > */}
      {/*     <ButtonText>Sign Out</ButtonText> */}
      {/*   </Button> */}
      {/* </Box> */}

      {/* <Fab */}
      {/*   size="lg" */}
      {/*   placement="bottom right" */}
      {/*   onPress={() => setAddSheetOpen(!isAddSheetOpen)} */}
      {/* > */}
      {/*   <FabIcon as={AddIcon} /> */}
      {/* </Fab> */}
      {/* <AddLinkActionSheet */}
      {/*   isOpen={isAddSheetOpen} */}
      {/*   onClose={() => setAddSheetOpen(false)} */}
      {/* /> */}
    </SafeAreaView>
  );
}

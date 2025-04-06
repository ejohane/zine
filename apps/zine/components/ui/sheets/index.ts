import { AddLinkActionSheet } from "@/components/add-link-action-sheet/add-link-action-sheet";
import { AddTagActionSheet } from "@/components/tags/add-tag-action-sheet";
import { registerSheet, SheetDefinition } from "react-native-actions-sheet";

registerSheet("add-link", AddLinkActionSheet);
registerSheet("add-tag", AddTagActionSheet);

// We extend some of the types here to give us great intellisense
// across the app for all registered sheets.
declare module "react-native-actions-sheet" {
  interface Sheets {
    "add-link": SheetDefinition;
    "add-tag": SheetDefinition;
  }
}

export {};

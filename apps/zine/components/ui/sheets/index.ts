import { AddLinkActionSheet } from "@/components/add-link-action-sheet/add-link-action-sheet";
import { registerSheet, SheetDefinition } from "react-native-actions-sheet";

registerSheet("add-link", AddLinkActionSheet);

// We extend some of the types here to give us great intellisense
// across the app for all registered sheets.
declare module "react-native-actions-sheet" {
  interface Sheets {
    "add-link": SheetDefinition;
  }
}

export {};

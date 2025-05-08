import { get_documents } from "./get_documents";
import { get_rules } from "./get_rules";
import { list_collections } from "./list_collections";

export const firestoreTools = [
  list_collections,
  get_documents,
  get_rules,
];

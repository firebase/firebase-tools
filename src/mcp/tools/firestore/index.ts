import { get_firestore_documents } from "./get_firestore_documents";
import { get_firestore_rules } from "./get_firestore_rules";
import { list_firestore_collections } from "./list_firestore_collections";

export const firestoreTools = [
  list_firestore_collections,
  get_firestore_documents,
  get_firestore_rules,
];

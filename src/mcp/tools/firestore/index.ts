import { delete_document } from "./delete_document";
import { get_documents } from "./get_documents";
import { list_collections } from "./list_collections";
import { query_collection } from "./query_collection";
import { commit_document } from "./commit_document";
import { validateRulesTool } from "../rules/validate_rules";
import { getRulesTool } from "../rules/get_rules";

export const firestoreTools = [
  delete_document,
  get_documents,
  list_collections,
  query_collection,
  commit_document,
  getRulesTool("Firestore", "cloud.firestore"),
  validateRulesTool("Firestore"),
];

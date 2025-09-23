import { delete_document } from "./delete_document";
import { get_documents } from "./get_documents";
import { list_collections } from "./list_collections";
import { query_collection } from "./query_collection";

export const firestoreTools = [
  delete_document,
  get_documents,
  list_collections,
  query_collection,
];

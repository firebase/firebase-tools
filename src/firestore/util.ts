import { FirebaseError } from "../error";

interface IndexName {
  projectId: string;
  collectionGroupId: string;
  indexId: string;
}

interface FieldName {
  projectId: string;
  collectionGroupId: string;
  fieldPath: string;
}

// projects/$PROJECT_ID/databases/(default)/collectionGroups/$COLLECTION_GROUP_ID/indexes/$INDEX_ID
const INDEX_NAME_REGEX =
  /projects\/([^\/]+?)\/databases\/\(default\)\/collectionGroups\/([^\/]+?)\/indexes\/([^\/]*)/;

// projects/$PROJECT_ID/databases/(default)/collectionGroups/$COLLECTION_GROUP_ID/fields/$FIELD_ID
const FIELD_NAME_REGEX =
  /projects\/([^\/]+?)\/databases\/\(default\)\/collectionGroups\/([^\/]+?)\/fields\/([^\/]*)/;

/**
 * Parse an Index name into useful pieces.
 */
export function parseIndexName(name?: string): IndexName {
  if (!name) {
    throw new FirebaseError(`Cannot parse undefined index name.`);
  }

  const m = name.match(INDEX_NAME_REGEX);
  if (!m || m.length < 4) {
    throw new FirebaseError(`Error parsing index name: ${name}`);
  }

  return {
    projectId: m[1],
    collectionGroupId: m[2],
    indexId: m[3],
  };
}

/**
 * Parse an Field name into useful pieces.
 */
export function parseFieldName(name: string): FieldName {
  const m = name.match(FIELD_NAME_REGEX);
  if (!m || m.length < 4) {
    throw new FirebaseError(`Error parsing field name: ${name}`);
  }

  return {
    projectId: m[1],
    collectionGroupId: m[2],
    fieldPath: m[3],
  };
}

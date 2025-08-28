import { FirebaseError } from "../error";

interface DatabaseName {
  projectId: string;
  databaseId: string;
}

interface IndexName {
  projectId: string;
  databaseId: string;
  collectionGroupId: string;
  indexId: string;
}

interface FieldName {
  projectId: string;
  databaseId: string;
  collectionGroupId: string;
  fieldPath: string;
}

// projects/$PROJECT_ID/databases/$DATABASE_ID
const DATABASE_NAME_REGEX = /projects\/([^\/]+?)\/databases\/([^\/]+)/;

// projects/$PROJECT_ID/databases/$DATABASE_ID/collectionGroups/$COLLECTION_GROUP_ID/indexes/$INDEX_ID
const INDEX_NAME_REGEX =
  /projects\/([^\/]+?)\/databases\/([^\/]+?)\/collectionGroups\/([^\/]+?)\/indexes\/([^\/]*)/;

// projects/$PROJECT_ID/databases/$DATABASE_ID/collectionGroups/$COLLECTION_GROUP_ID/fields/$FIELD_ID
const FIELD_NAME_REGEX =
  /projects\/([^\/]+?)\/databases\/([^\/]+?)\/collectionGroups\/([^\/]+?)\/fields\/([^\/]*)/;

/**
 * Parse a Database name into useful pieces.
 */
export function parseDatabaseName(name?: string): DatabaseName {
  if (!name) {
    throw new FirebaseError(`Cannot parse undefined database name.`);
  }

  const m = name.match(DATABASE_NAME_REGEX);
  if (!m || m.length < 3) {
    throw new FirebaseError(`Error parsing database name: ${name}`);
  }

  return {
    projectId: m[1],
    databaseId: m[2],
  };
}

/**
 * Parse an Index name into useful pieces.
 */
export function parseIndexName(name?: string): IndexName {
  if (!name) {
    throw new FirebaseError(`Cannot parse undefined index name.`);
  }

  const m = name.match(INDEX_NAME_REGEX);
  if (!m || m.length < 5) {
    throw new FirebaseError(`Error parsing index name: ${name}`);
  }

  return {
    projectId: m[1],
    databaseId: m[2],
    collectionGroupId: m[3],
    indexId: m[4],
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
    databaseId: m[2],
    collectionGroupId: m[3],
    fieldPath: m[4],
  };
}

/**
 * Performs XOR operator between two boolean values
 */
export function booleanXOR(a: boolean, b: boolean): boolean {
  return !!(Number(a) - Number(b));
}

/**
 * Get the current time truncated to minutes.
 *
 * For some tasks, eg. database clone, this will be the most recent available snapshot time.
 *
 * @returns A Protobuf-friendly ISO string of the current time in the UTC timezone
 */
export function getCurrentMinuteAsIsoString(): string {
  // Note that JS Dates support millisecond precision at max and that toISOString forces the UTC timezone, which will be represented by the (Protobuf-friendly) "Z"
  const mostRecentTimestamp = new Date(Date.now());
  mostRecentTimestamp.setSeconds(0, 0);
  return mostRecentTimestamp.toISOString();
}

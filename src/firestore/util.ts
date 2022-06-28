/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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

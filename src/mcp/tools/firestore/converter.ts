import { FirestoreDocument, FirestoreValue } from "../../../gcp/firestore";
import { logger } from "../../../logger";

/**
 * Converts a Firestore REST API Value object to a plain Javascript object,
 * applying special transformations for Reference and GeoPoint types, and
 * handling integer values potentially larger than JS MAX_SAFE_INTEGER.
 * @param {FirestoreValue} firestoreValue The Firestore Value object.
 * @return {any} The plain Javascript object.
 */
function firestoreValueToJson(firestoreValue: FirestoreValue): any {
  if ("nullValue" in firestoreValue) return null;
  if ("booleanValue" in firestoreValue) return firestoreValue.booleanValue;
  if ("integerValue" in firestoreValue) {
    // Firestore returns integers as strings in REST. Convert to Number if safe,
    // otherwise keep as string to avoid precision loss for int64.
    const num = Number(firestoreValue.integerValue);
    if (num > Number.MAX_SAFE_INTEGER || num < Number.MIN_SAFE_INTEGER) {
      return firestoreValue.integerValue; // Keep as string for large integers (int64)
    }
    return num; // Convert to number if within safe integer range
  }
  if ("doubleValue" in firestoreValue) return firestoreValue.doubleValue;
  if ("timestampValue" in firestoreValue)
    return { __type__: "Timestamp", value: firestoreValue.timestampValue };
  if ("stringValue" in firestoreValue) return firestoreValue.stringValue;
  if ("bytesValue" in firestoreValue) return firestoreValue.bytesValue;
  if ("referenceValue" in firestoreValue)
    return { __type__: "Reference", value: firestoreValue.referenceValue };
  if ("geoPointValue" in firestoreValue)
    return {
      __type__: "GeoPoint",
      value: [firestoreValue.geoPointValue.latitude, firestoreValue.geoPointValue.longitude],
    };
  if ("arrayValue" in firestoreValue)
    return firestoreValue.arrayValue.values?.map((v) => firestoreValueToJson(v)) ?? [];
  if ("mapValue" in firestoreValue) {
    const map = firestoreValue.mapValue.fields || {};
    const obj: { [key: string]: any } = {};
    // Recursively convert map values
    for (const key of Object.keys(map)) {
      obj[key] = firestoreValueToJson(map[key]);
    }
    return obj;
  }
  // Should not happen with a valid FirestoreValue from the API
  logger.warn("Unhandled Firestore Value type encountered:", firestoreValue);
  return undefined; // Or throw an error
}

/**
 * Converts a Firestore REST API Document object to a plain Javascript object.
 * Follows specific conversion rules for certain types (Reference, GeoPoint, Int64).
 * Includes the document ID extracted from the 'name' field as `__id__`.
 *
 * Fields that are not set in the document will be omitted.
 * @param {FirestoreDocument} firestoreDoc The Firestore Document object.
 * @return {{ __id__: string; [key: string]: any }} The plain Javascript object.
 */
export function firestoreDocumentToJson(firestoreDoc: FirestoreDocument): {
  __path__: string;
  [key: string]: any;
} {
  // Extract ID from the document name (last segment after '/documents/').
  // Format: projects/{projectId}/databases/{databaseId}/documents/{document_path}
  const nameParts = firestoreDoc.name.split("/documents/");
  const path = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";

  // Initialize the result object with the extracted ID.
  const result: ReturnType<typeof firestoreValueToJson> = { __path__: path };

  // If the document has fields, process them using the helper function.
  if (firestoreDoc.fields) {
    for (const key of Object.keys(firestoreDoc.fields)) {
      result[key] = firestoreValueToJson(firestoreDoc.fields[key]);
    }
  }

  // Return the resulting JSON object.
  return result;
}

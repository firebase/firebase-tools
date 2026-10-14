import * as _ from "lodash";

import { FirebaseError } from "../error";

function isPlainObject(input: any): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    _.isEqual(Object.getPrototypeOf(input), Object.prototype)
  );
}

function encodeHelper(val: any): any {
  if (typeof val === "string") {
    return { stringValue: val };
  }
  if (val === !!val) {
    return { booleanValue: val };
  }
  if (Number.isInteger(val)) {
    return { integerValue: val };
  }
  // Integers are handled above, the remaining numbers are treated as doubles
  if (typeof val === "number") {
    return { doubleValue: val };
  }
  if (val instanceof Date && !Number.isNaN(val)) {
    return { timestampValue: val.toISOString() };
  }
  if (Array.isArray(val)) {
    const encodedElements = [];
    for (const v of val) {
      const enc = encodeHelper(v);
      if (enc) {
        encodedElements.push(enc);
      }
    }
    return {
      arrayValue: { values: encodedElements },
    };
  }
  if (val === null) {
    return { nullValue: "NULL_VALUE" };
  }
  if (val instanceof Buffer || val instanceof Uint8Array) {
    return { bytesValue: val };
  }
  if (isPlainObject(val)) {
    return {
      mapValue: { fields: encodeFirestoreValue(val) },
    };
  }
  throw new FirebaseError(
    `Cannot encode ${val} to a Firestore Value. ` +
      "The emulator does not yet support Firestore document reference values or geo points.",
  );
}

export function encodeFirestoreValue(data: any): Record<string, any> {
  return Object.entries(data).reduce(
    (acc, [key, val]) => {
      acc[key] = encodeHelper(val);
      return acc;
    },
    {} as Record<string, any>,
  );
}

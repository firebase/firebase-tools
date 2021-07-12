import { FirebaseError } from "../../../../error";

// Use "omit" for output only fields. This allows us to fully exhaust keyof T
// while still recognizing output-only fields
export type KeyType = "string" | "number" | "boolean" | "object" | "array" | "omit";
export function requireKeys<T extends object>(prefix: string, yaml: T, ...keys: (keyof T)[]) {
  if (prefix) {
    prefix = prefix + ".";
  }
  for (const key of keys) {
    if (!yaml[key]) {
      throw new FirebaseError(`Expected key ${prefix + key}`);
    }
  }
}

export function assertKeyTypes<T extends Object>(
  prefix: string,
  yaml: T | undefined,
  schema: Record<keyof T, KeyType>
) {
  if (!yaml) {
    return;
  }
  for (const [keyAsString, value] of Object.entries(yaml)) {
    // I don't know why Object.entries(foo)[0] isn't type of keyof foo...
    const key = keyAsString as keyof T;
    const fullKey = prefix ? prefix + "." + key : key;
    if (!schema[key] || schema[key] === "omit") {
      throw new FirebaseError(
        `Unexpected key ${fullKey}. You may need to install a newer version of the Firebase CLI`
      );
    }
    if (schema[key] === "string") {
      if (typeof value !== "string") {
        throw new FirebaseError(`Expected ${fullKey} to be string; was ${typeof value}`);
      }
    } else if (schema[key] === "number") {
      if (typeof value !== "number") {
        throw new FirebaseError(`Expected ${fullKey} to be a number; was ${typeof value}`);
      }
    } else if (schema[key] === "boolean") {
      if (typeof value !== "boolean") {
        throw new FirebaseError(`Expected ${fullKey} to be a boolean; was ${typeof value}`);
      }
    } else if (schema[key] === "array") {
      if (!Array.isArray(value)) {
        throw new FirebaseError(`Expected ${fullKey} to be an array; was ${typeof value}`);
      }
    } else if (schema[key] === "object") {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new FirebaseError(`Expected ${fullKey} to be an object; was ${typeof value}`);
      }
    } else {
      throw new FirebaseError("YAML validation is missing a handled type " + schema[key]);
    }
  }
}

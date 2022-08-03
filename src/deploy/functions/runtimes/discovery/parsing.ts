import { FirebaseError } from "../../../../error";

export type BaseType<T> = T extends string
  ? "string"
  : T extends number
  ? "number"
  : T extends boolean
  ? "boolean"
  : T extends unknown[]
  ? "array"
  : T extends object
  ? "object"
  : never;

// BUG BUG BUG
// This is what the definition of NullSuffix _should_ be:
// export type NullSuffix<T> = T extends null ? "?" : "";
//
// But something weird is happening. When passing objects whose keys can be
// T or null, Schema is matching FieldType<T> instead of FieldType<T | Null>
// and the compiler prevents users from using the nullable version. Stranger
// still, this compiler error happens with `npm run test` but not `npx mocha`.
// This is a bug, but it's not worth continuing to hold back other improvements
// and it is assumed many cases of string?, number?, etc will go away once we
// have field<T> as a type
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type NullSuffix<T> = "?" | "";

// Use "omit" for output only fields. This allows us to fully exhaust keyof T
// while still recognizing output-only fields
export type FieldType<T> = `${BaseType<T>}${NullSuffix<T>}` | "omit" | ((t: T) => boolean);

export type Schema<T extends object> = {
  [Key in keyof Required<T>]: FieldType<Required<T>[Key]>;
};

/**
 * Asserts that all yaml contains all required keys specified in the schema.
 */
export function requireKeys<T extends object>(prefix: string, yaml: T, ...keys: (keyof T)[]): void {
  if (prefix) {
    prefix = prefix + ".";
  }
  for (const key of keys) {
    if (!yaml[key]) {
      throw new FirebaseError(`Expected key ${prefix + key}`);
    }
  }
}

/**
 * Asserts that runtime types of the given object matches the type specified in the schema.
 */
export function assertKeyTypes<T extends object>(
  prefix: string,
  yaml: T | undefined,
  schema: Schema<T>
): void {
  if (!yaml) {
    return;
  }
  for (const [keyAsString, value] of Object.entries(yaml)) {
    // I don't know why Object.entries(foo)[0] isn't type of keyof foo...
    const key = keyAsString as keyof T;
    const fullKey = prefix ? `${prefix}.${keyAsString}` : keyAsString;
    if (!schema[key] || schema[key] === "omit") {
      throw new FirebaseError(
        `Unexpected key ${fullKey}. You may need to install a newer version of the Firebase CLI.`
      );
    }
    let schemaType = schema[key] as string | ((value: T[keyof T]) => boolean);
    if (typeof schemaType === "function") {
      if (!schemaType(value as T[keyof T])) {
        const friendlyName =
          value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
        throw new FirebaseError(`${friendlyName} ${fullKey} failed validation`);
      }
      continue;
    }

    if (value === null) {
      if (schemaType.endsWith("?")) {
        continue;
      }
      throw new FirebaseError(`Expected ${fullKey}} to be type ${schemaType}; was null`);
    }
    if (schemaType.endsWith("?")) {
      schemaType = schemaType.slice(0, schemaType.length - 1);
    }
    if (schemaType === "string") {
      if (typeof value !== "string") {
        throw new FirebaseError(`Expected ${fullKey} to be type string; was ${typeof value}`);
      }
    } else if (schemaType === "number") {
      if (typeof value !== "number") {
        throw new FirebaseError(`Expected ${fullKey} to be type number; was ${typeof value}`);
      }
    } else if (schemaType === "boolean") {
      if (typeof value !== "boolean") {
        throw new FirebaseError(`Expected ${fullKey} to be type boolean; was ${typeof value}`);
      }
    } else if (schemaType === "array") {
      if (!Array.isArray(value)) {
        throw new FirebaseError(`Expected ${fullKey} to be type array; was ${typeof value}`);
      }
    } else if (schemaType === "object") {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new FirebaseError(`Expected ${fullKey} to be type object; was ${typeof value}`);
      }
    } else {
      throw new FirebaseError("YAML validation is missing a handled type " + schema[key]);
    }
  }
}

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

import { FirebaseError } from "../../../../error";

// Use "omit" for output only fields. This allows us to fully exhaust keyof T
// while still recognizing output-only fields
export type KeyType<T> =
  | (T extends string
      ? "string"
      : T extends number
      ? "number"
      : T extends boolean
      ? "boolean"
      : T extends unknown[]
      ? "array"
      : T extends object
      ? "object"
      : never)
  | "omit"
  | ((t: T) => boolean);
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
  schema: { [Key in keyof Required<T>]: KeyType<Required<T>[Key]> }
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
    const schemaType = schema[key];
    if (typeof schemaType === "function") {
      if (!schemaType(value as T[keyof T])) {
        throw new FirebaseError(
          `${Array.isArray(value) ? "array" : typeof value} ${fullKey} failed validation`
        );
      }
    } else if (schemaType === "string") {
      if (typeof value !== "string") {
        throw new FirebaseError(`Expected ${fullKey} to be string; was ${typeof value}`);
      }
    } else if (schemaType === "number") {
      if (typeof value !== "number") {
        throw new FirebaseError(`Expected ${fullKey} to be a number; was ${typeof value}`);
      }
    } else if (schemaType === "boolean") {
      if (typeof value !== "boolean") {
        throw new FirebaseError(`Expected ${fullKey} to be a boolean; was ${typeof value}`);
      }
    } else if (schemaType === "array") {
      if (!Array.isArray(value)) {
        throw new FirebaseError(`Expected ${fullKey} to be an array; was ${typeof value}`);
      }
    } else if (schemaType === "object") {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new FirebaseError(`Expected ${fullKey} to be an object; was ${typeof value}`);
      }
    } else {
      throw new FirebaseError("YAML validation is missing a handled type " + schema[key]);
    }
  }
}

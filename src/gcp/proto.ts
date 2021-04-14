import { FirebaseError } from "../error";

// A proto duration is a number in seconds appended with "s"
export type Duration = string;

export function secondsFromDuration(d: Duration): number {
  return +d.slice(0, d.length - 1);
}

export function durationFromSeconds(s: number): Duration {
  return `${s}s`;
}

export function assertOneOf<T>(typename: string, obj: T, oneof: string, ...fields: (keyof T)[]) {
  const defined = [];
  for (const key of fields) {
    const value = obj[key];
    if (typeof value !== "undefined" && value != null) {
      defined.push(key);
    }
  }

  if (defined.length > 1) {
    throw new FirebaseError(
      `Invalid ${typename} definition. ${oneof} can only have one field defined, but found ${defined.join(
        ","
      )}`
    );
  }
}

// Utility function to help copy fields from type A to B.
// As a safety net, catches typos or fields that aren't named the same
// in A and B, but cannot verify that both Src and Dest have the same type for the same field.
export function copyIfPresent<Src, Dest>(
  dest: Dest,
  src: Src,
  ...fields: (keyof Src & keyof Dest)[]
) {
  for (const field of fields) {
    if (typeof src[field] === "undefined") {
      continue;
    }
    dest[field] = src[field] as any;
  }
}

export function renameIfPresent<Src, Dest>(
  dest: Dest,
  src: Src,
  destField: keyof Dest,
  srcField: keyof Src,
  converter: (from: any) => any = (from: any) => {
    return from;
  }
) {
  if (typeof src[srcField] === "undefined") {
    return;
  }
  dest[destField] = converter(src[srcField]);
}

export function fieldMasks(object: Record<string, any>): string[] {
  const masks: string[] = [];
  for (const key of Object.keys(object)) {
    fieldMasksHelper(key, object[key], masks);
  }
  return masks;
}

function fieldMasksHelper(prefix: string, cursor: any, masks: string[]) {
  if (cursor === null || typeof cursor !== "object" || Array.isArray(cursor)) {
    masks.push(prefix);
    return;
  }

  const cursorKeys = Object.keys(cursor);
  // An empty object (e.g. CloudFunction.httpsTrigger) is an explicit object.
  // This is needed for protobuf.Empty
  if (cursorKeys.length === 0) {
    masks.push(prefix);
    return;
  }

  for (const key of cursorKeys) {
    fieldMasksHelper(`${prefix}.${key}`, cursor[key], masks);
  }
}

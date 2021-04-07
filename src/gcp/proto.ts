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
  field: keyof Src & keyof Dest,
  converter: (from: any) => any = (from: any) => {
    return from;
  }
) {
  if (typeof src[field] === "undefined") {
    return;
  }
  dest[field] = converter(src[field]);
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

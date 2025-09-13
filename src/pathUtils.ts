import * as path from "path";
import { FirebaseError } from "./error";

/**
 * Resolves `subPath` against `base` and ensures the result is contained within `base`.
 * Throws a FirebaseError with an optional message if the resolved path escapes `base`.
 */
export function resolveWithin(base: string, subPath: string, errMsg?: string): string {
  const abs = path.resolve(base, subPath);
  const rel = path.relative(base, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new FirebaseError(errMsg || `Path "${subPath}" must be within "${base}".`);
  }
  return abs;
}

import { FirebaseError } from "../error";
import { RecursiveKeyOf } from "../metaprogramming";

/**
 * A type alias used to annotate interfaces as using a google.protobuf.Duration.
 * This type is parsed/encoded as a string of seconds + the "s" prefix.
 */
export type Duration = string;

/** Get the number of seconds in a google.protobuf.Duration. */
export function secondsFromDuration(d: Duration): number {
  return +d.slice(0, d.length - 1);
}

/** Get a google.protobuf.Duration for a number of seconds. */
export function durationFromSeconds(s: number): Duration {
  return `${s}s`;
}

/**
 * Throws unless obj contains at no more than one key in "fields".
 * This verifies that proto oneof constraints, which can't be codified in JSON, are honored
 * @param typename The name of the proto type for error messages
 * @param obj The proto object that should have a "oneof" constraint
 * @param oneof The name of the field that should be a "oneof" for error messages
 * @param fields The fields that are defiend as a oneof in the proto definition
 */
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
        ",",
      )}`,
    );
  }
}

/**
 * Utility function to help copy fields from type A to B.
 * As a safety net, catches typos or fields that aren't named the same
 * in A and B, but cannot verify that both Src and Dest have the same type for the same field.
 */
export function copyIfPresent<Dest extends object, Keys extends (keyof Dest)[]>(
  dest: Dest,
  src: { [Key in Keys[number]]?: Dest[Key] },
  ...fields: Keys
): void {
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(src, field)) {
      continue;
    }
    dest[field] = src[field]!;
  }
}

/**
 * Utility function to help convert a field from type A to B if they are present.
 */
export function convertIfPresent<
  Dest extends object,
  Src extends object,
  Key extends keyof Src & keyof Dest,
>(
  dest: Dest,
  src: Src,
  key: Key,
  converter: (from: Required<Src>[Key]) => Required<Dest>[Key],
): void;

/**
 * Utility function to help convert a field from type A to type B while renaming.
 */
export function convertIfPresent<
  Dest extends object,
  Src extends object,
  DestKey extends keyof Dest,
  SrcKey extends keyof Src,
>(
  dest: Dest,
  src: Src,
  destKey: DestKey,
  srcKey: SrcKey,
  converter: (from: Required<Src>[SrcKey]) => Required<Dest>[DestKey],
): void;

/** Overload */
export function convertIfPresent<
  Dest extends object,
  Src extends object,
  DestKey extends keyof Dest,
  SrcKey extends keyof Src,
  MutualKey extends keyof Dest & keyof Src,
>(
  ...args:
    | [
        dest: Dest,
        src: Src,
        key: MutualKey,
        converter: (from: Required<Src>[MutualKey]) => Required<Dest>[MutualKey],
      ]
    | [
        dest: Dest,
        src: Src,
        destKey: DestKey,
        srcKey: SrcKey,
        converter: (from: Required<Src>[SrcKey]) => Required<Dest>[DestKey],
      ]
): void {
  if (args.length === 4) {
    const [dest, src, key, converter] = args;
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      dest[key] = converter(src[key]);
    }
    return;
  }
  const [dest, src, destKey, srcKey, converter] = args;
  if (Object.prototype.hasOwnProperty.call(src, srcKey)) {
    dest[destKey] = converter(src[srcKey]);
  }
}

/** Moves a field from one key in source to another key in dest */
export function renameIfPresent<DestKey extends string, SrcKey extends string, ValType>(
  dest: { [Key in DestKey]?: ValType },
  src: { [Key in SrcKey]?: ValType },
  destKey: DestKey,
  srcKey: SrcKey,
): void {
  if (!Object.prototype.hasOwnProperty.call(src, srcKey)) {
    return;
  }
  dest[destKey] = src[srcKey];
}

/**
 * Calculate a field mask of all values set in object.
 * If the proto definition has a map<string, string>, keys will be user-defined
 * and should not be recursed. Specify this by adding a field mask prefix for doNotRecurseIn.
 * @param object The proto JSON object. If a field should be explicitly deleted, it should be
 *               set to `undefined`. This allows field masks to pick it up but JSON.stringify
 *               to drop it.
 * @param doNotRecurseIn the dot-delimited address of fields which, if present, are proto map
 *                       types and their keys are not part of the field mask.
 */
export function fieldMasks<T extends object>(
  object: T,
  ...doNotRecurseIn: Array<RecursiveKeyOf<T>>
): string[] {
  const masks: string[] = [];
  fieldMasksHelper([], object, doNotRecurseIn, masks);
  return masks;
}

function fieldMasksHelper(
  prefixes: string[],
  cursor: unknown,
  doNotRecurseIn: string[],
  masks: string[],
): void {
  // Empty arrays should never be sent because they're dropped by the one platform
  // gateway and then services get confused why there's an update mask for a missing field"
  if (Array.isArray(cursor) && !cursor.length) {
    return;
  }

  if (typeof cursor !== "object" || (Array.isArray(cursor) && cursor.length) || cursor === null) {
    masks.push(prefixes.join("."));
    return;
  }

  const entries = Object.entries(cursor);
  // An empty object (e.g. CloudFunction.httpsTrigger) is an explicit object.
  // This is needed for protobuf.Empty
  if (entries.length === 0) {
    masks.push(prefixes.join("."));
    return;
  }

  for (const [key, value] of entries) {
    const newPrefixes = [...prefixes, key];
    if (doNotRecurseIn.includes(newPrefixes.join("."))) {
      masks.push(newPrefixes.join("."));
      continue;
    }
    fieldMasksHelper(newPrefixes, value, doNotRecurseIn, masks);
  }
}

/**
 * Gets the correctly invoker members to be used with the invoker role for IAM API calls.
 * @param invoker the array of non-formatted invoker members
 * @param projectId the ID of the current project
 * @return an array of correctly formatted invoker members
 * @throws {@link FirebaseError} if any invoker string is empty or not of the correct form
 */
export function getInvokerMembers(invoker: string[], projectId: string): string[] {
  if (invoker.includes("private")) {
    return [];
  }
  if (invoker.includes("public")) {
    return ["allUsers"];
  }
  return invoker.map((inv) => formatServiceAccount(inv, projectId));
}

/**
 * Formats the service account to be used with IAM API calls, a vaild service account string is
 * '{service-account}@' or '{service-account}@{project}.iam.gserviceaccount.com'.
 * @param serviceAccount the custom service account created by the user
 * @param projectId the ID of the current project
 * @return a correctly formatted service account string
 * @throws {@link FirebaseError} if the supplied service account string is empty or not of the correct form
 */
export function formatServiceAccount(serviceAccount: string, projectId: string): string {
  if (serviceAccount.length === 0) {
    throw new FirebaseError("Service account cannot be an empty string");
  }
  if (!serviceAccount.includes("@")) {
    throw new FirebaseError(
      "Service account must be of the form 'service-account@' or 'service-account@{project-id}.iam.gserviceaccount.com'",
    );
  }

  if (serviceAccount.endsWith("@")) {
    const suffix = `${projectId}.iam.gserviceaccount.com`;
    return `serviceAccount:${serviceAccount}${suffix}`;
  }
  return `serviceAccount:${serviceAccount}`;
}

/**
 * Remove keys whose values are undefined.
 * When we write an interface { foo?: number } there are three possible
 * forms: { foo: 1 }, {}, and { foo: undefined }. The latter surprises
 * most people and make unit test comparison flaky. This cleans that up.
 */
export function pruneUndefiends(obj: unknown): void {
  if (typeof obj !== "object" || obj === null) {
    return;
  }
  const keyable = obj as Record<string, unknown>;
  for (const key of Object.keys(keyable)) {
    if (keyable[key] === undefined) {
      delete keyable[key];
    } else if (typeof keyable[key] === "object") {
      if (Array.isArray(keyable[key])) {
        for (const sub of keyable[key] as unknown[]) {
          pruneUndefiends(sub);
        }
        keyable[key] = (keyable[key] as unknown[]).filter((e) => e !== undefined);
      } else {
        pruneUndefiends(keyable[key]);
      }
    }
  }
}

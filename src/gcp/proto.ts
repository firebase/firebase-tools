import { FirebaseError } from "../error";

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
        ","
      )}`
    );
  }
}

// eslint-disable @typescript-eslint/no-unsafe-returns @typescript-eslint/no-explicit-any

/**
 * Utility function to help copy fields from type A to B.
 * As a safety net, catches typos or fields that aren't named the same
 * in A and B, but cannot verify that both Src and Dest have the same type for the same field.
 */
export function copyIfPresent<Src, Dest>(
  dest: Dest,
  src: Src,
  ...fields: (keyof Src & keyof Dest)[]
) {
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(src, field)) {
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
  if (!Object.prototype.hasOwnProperty.call(src, srcField)) {
    return;
  }
  dest[destField] = converter(src[srcField]);
}

// eslint-enable @typescript-eslint/no-unsafe-returns @typescript-eslint/no-explicit-any

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
export function fieldMasks(object: Record<string, any>, ...doNotRecurseIn: string[]): string[] {
  const masks: string[] = [];
  fieldMasksHelper([], object, doNotRecurseIn, masks);
  return masks;
}

function fieldMasksHelper(
  prefixes: string[],
  cursor: unknown,
  doNotRecurseIn: string[],
  masks: string[]
) {
  if (typeof cursor !== "object" || Array.isArray(cursor) || cursor === null) {
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
 * @returns an array of correctly formatted invoker members
 *
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
 * @returns a correctly formatted service account string
 *
 * @throws {@link FirebaseError} if the supplied service account string is empty or not of the correct form
 */
export function formatServiceAccount(serviceAccount: string, projectId: string): string {
  if (serviceAccount.length === 0) {
    throw new FirebaseError("Service account cannot be an empty string");
  }
  if (!serviceAccount.includes("@")) {
    throw new FirebaseError(
      "Service account must be of the form 'service-account@' or 'service-account@{project-id}.iam.gserviceaccount.com'"
    );
  }

  if (serviceAccount.endsWith("@")) {
    const suffix = `${projectId}.iam.gserviceaccount.com`;
    return `serviceAccount:${serviceAccount}${suffix}`;
  }
  return `serviceAccount:${serviceAccount}`;
}

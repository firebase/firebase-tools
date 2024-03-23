import * as semver from "semver";

import { FirebaseError } from "../error";

const refRegex = new RegExp(/^([^/@\n]+)\/{1}([^/@\n]+)(@{1}([^\n]+)|)$/);

/**
 * Ref is a type for converting between the various string representations of an extension or version.
 */
export interface Ref {
  publisherId: string;
  extensionId: string;
  version?: string;
}

/**
 * Parse a extension ref or name into a Ref
 * @param refOrName an extension or extension version
 *                  ref (publisher/extension@version)
 *                   or fully qualified name
 */
export function parse(refOrName: string): Ref {
  const ret = parseRef(refOrName) || parseName(refOrName);
  if (!ret || !ret.publisherId || !ret.extensionId) {
    throw new FirebaseError(`Unable to parse ${refOrName} as an extension ref`);
  }
  if (
    ret.version &&
    !semver.valid(ret.version) &&
    !semver.validRange(ret.version) &&
    !["latest", "latest-approved"].includes(ret.version)
  ) {
    throw new FirebaseError(
      `Extension reference ${ret} contains an invalid version ${ret.version}.`,
    );
  }
  return ret;
}

function parseRef(ref: string): Ref | undefined {
  const parts = refRegex.exec(ref);
  // Exec additionally returns original string, index, & input values.
  if (parts && (parts.length === 5 || parts.length === 7)) {
    const publisherId = parts[1];
    const extensionId = parts[2];
    const version = parts[4];
    return { publisherId, extensionId, version };
  }
}

function parseName(name: string): Ref | undefined {
  const parts = name.split("/");
  return {
    publisherId: parts[1],
    extensionId: parts[3],
    version: parts[5],
  };
}

/**
 * To an extension ref: publisherId/extensionId
 */
export function toExtensionRef(ref: Ref): string {
  return `${ref.publisherId}/${ref.extensionId}`;
}

/**
 * To an extension version ref: publisherId/extensionId@version
 */
export function toExtensionVersionRef(ref: Ref): string {
  if (!ref.version) {
    throw new FirebaseError(`Ref does not have a version`);
  }
  return `${ref.publisherId}/${ref.extensionId}@${ref.version}`;
}

/**
 * To a fully qualified extension name : publishers/publisherId/extensions/extensionId
 */
export function toExtensionName(ref: Ref): string {
  return `publishers/${ref.publisherId}/extensions/${ref.extensionId}`;
}

/**
 * To a fully qualified extension version name : publishers/publisherId/extensions/extensionId/version/versionId
 */
export function toExtensionVersionName(ref: Ref): string {
  if (!ref.version) {
    throw new FirebaseError(`Ref does not have a version`);
  }
  return `publishers/${ref.publisherId}/extensions/${ref.extensionId}/versions/${ref.version}`;
}

/**
 * Checks if two refs refer to the same extensionVersion.
 */
export function equal(a?: Ref, b?: Ref): boolean {
  return (
    !!a &&
    !!b &&
    a.publisherId === b.publisherId &&
    a.extensionId === b.extensionId &&
    a.version === b.version
  );
}

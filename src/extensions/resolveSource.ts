import * as _ from "lodash";
import * as clc from "cli-color";
import * as semver from "semver";
import * as api from "../api";
import { FirebaseError } from "../error";
import { confirmUpdateWarning } from "./updateHelper";

const EXTENSIONS_REGISTRY_ENDPOINT = "/extensions.json";

export interface RegistryEntry {
  icons?: { [key: string]: string };
  labels: { [key: string]: string };
  versions: { [key: string]: string };
  updateWarnings?: { [key: string]: UpdateWarning[] };
}

export interface UpdateWarning {
  from: string;
  description: string;
  action?: string;
}

/**
 * Gets the sourceUrl for a given extension name and version from the official extensions registry
 * @param version the version of the extension
 * @param name the name of the extension.
 * @returns the source corresponding to extensionName in the registry.
 */
export function resolveSourceUrl(
  registryEntry: RegistryEntry,
  name: string,
  version: string
): string {
  const targetVersion = getTargetVersion(registryEntry, version);
  const sourceUrl = _.get(registryEntry, ["versions", targetVersion]);
  if (!sourceUrl) {
    throw new FirebaseError(
      `Could not find version ${clc.bold(version)} of extension ${clc.bold(name)}.`
    );
  }
  return sourceUrl;
}

/**
 * Looks up and returns a entry from the official extensions registry.
 * @param name the name of the extension.
 */
export async function resolveRegistryEntry(name: string): Promise<RegistryEntry> {
  const extensionsRegistry = await getExtensionRegistry();
  const registryEntry = _.get(extensionsRegistry, name);
  if (!registryEntry) {
    throw new FirebaseError(`Unable to find extension source named ${clc.bold(name)}.`);
  }
  return registryEntry;
}

/**
 * Resolves a version or label to a version.
 * @param registryEntry A registry entry to get the version from.
 * @param versionOrLabel A version or label to resolve. Defaults to 'latest'.
 */
export function getTargetVersion(registryEntry: RegistryEntry, versionOrLabel?: string): string {
  // The version to search for when a user passes a version x.y.z or no version.
  const seekVersion = versionOrLabel || "latest";

  // The version to search for when a user passes a label like 'latest'.
  const versionFromLabel = _.get(registryEntry, ["labels", seekVersion]);

  return versionFromLabel || seekVersion;
}

/**
 * Checks for and prompts the user to accept updateWarnings that apply to the given start and end versions.
 * @param registryEntry the registry entry to check for updateWarnings.
 * @param startVersion the version that you are updating from.
 * @param endVersion the version you are updating to.
 * @throws FirebaseError if the user doesn't accept the update warning prompt.
 */
export async function promptForUpdateWarnings(
  registryEntry: RegistryEntry,
  startVersion: string,
  endVersion: string
): Promise<void> {
  if (registryEntry.updateWarnings) {
    for (const targetRange in registryEntry.updateWarnings) {
      if (semver.satisfies(endVersion, targetRange)) {
        const updateWarnings = registryEntry.updateWarnings[targetRange];
        for (const updateWarning of updateWarnings) {
          if (semver.satisfies(startVersion, updateWarning.from)) {
            await confirmUpdateWarning(updateWarning);
            break;
          }
        }
        break;
      }
    }
  }
}

/**
 * Fetches the official extensions registry.
 */
export async function getExtensionRegistry(): Promise<{ [key: string]: RegistryEntry }> {
  const res = await api.request("GET", EXTENSIONS_REGISTRY_ENDPOINT, {
    origin: api.firebaseExtensionsRegistryOrigin,
  });
  return res.body.mods;
}

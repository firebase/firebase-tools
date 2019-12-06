import * as _ from "lodash";
import * as clc from "cli-color";
import * as semver from "semver";
import * as api from "../api";
import { FirebaseError } from "../error";
import { logPrefix } from "./extensionsHelper";
import { displayUpdateWarning } from "./updateHelper";
import * as utils from "../utils";

const EXTENSIONS_REGISTRY_ENDPOINT = "/extensions.json";

export interface RegistryEntry {
  name: string;
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
 *
 * @param name the name of the extension to get the ExtensionSource for
 * @returns the source corresponding to extensionName in the registry
 */
export function resolveSourceUrl(registryEntry: RegistryEntry, version: string): string {
  const targetVersion = getTargetVersion(registryEntry, version);
  const sourceUrl =
    _.get(registryEntry, ["versions", targetVersion])
  if (!sourceUrl) {
    throw new FirebaseError(
      `Could not resolve version ${clc.bold(version)} of extension ${clc.bold(registryEntry.name)}.`
    );
  }
  return sourceUrl;
}

export async function resolveRegistryEntry(name: string): Promise<RegistryEntry> {
  const extensionsRegistry = await getExtensionRegistry();
  const registryEntry = _.get(extensionsRegistry, name);
  if (!registryEntry) {
    throw new FirebaseError(`Unable to find extension source named ${clc.bold(name)}.`);
  }
  return registryEntry; 
}

export function getTargetVersion(registryEntry: RegistryEntry, version?: string): string {
  // The version to search for when a user passes a version x.y.z or no version
  const seekVersion = version || "latest";

  // The version to search for when a user passes a label like 'latest'
  const versionFromLabel = _.get(registryEntry, ["labels", seekVersion]);

  return versionFromLabel || seekVersion;
}

/**
 * Checks for and displays updateWarnings that apply to the given start and end versions.
 * @param registryEntry the registry entry to check for updateWarnings in
 * @param startVersion the version that you are updating from.
 * @param endVersion the version you are updating to
 */
export async function checkForUpdateWarnings(
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
            await displayUpdateWarning(updateWarning);
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
async function getExtensionRegistry(): Promise<{ [key: string]: RegistryEntry }> {
  const res = await api.request("GET", EXTENSIONS_REGISTRY_ENDPOINT, {
    origin: api.firebaseExtensionsRegistryOrigin,
  });
  return res.body.mods;
}

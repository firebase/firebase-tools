import * as _ from "lodash";
import * as clc from "cli-color";
import * as marked from "marked";
import * as semver from "semver";
import * as api from "../api";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { promptOnce } from "../prompt";

const EXTENSIONS_REGISTRY_ENDPOINT = "/extensions.json";

export interface RegistryEntry {
  icons?: { [key: string]: string };
  labels: { [key: string]: string };
  versions: { [key: string]: string };
  updateWarnings?: { [key: string]: UpdateWarning[] };
  publisher: string;
}

export interface UpdateWarning {
  from: string;
  description: string;
  action?: string;
}

/**
 * Displays an update warning as markdown, and prompts the user for confirmation.
 * @param updateWarning The update warning to display and prompt for.
 */
export async function confirmUpdateWarning(updateWarning: UpdateWarning): Promise<void> {
  logger.info(marked(updateWarning.description));
  if (updateWarning.action) {
    logger.info(marked(updateWarning.action));
  }
  const continueUpdate = await promptOnce({
    type: "confirm",
    message: "Do you wish to continue with this update?",
    default: false,
  });
  if (!continueUpdate) {
    throw new FirebaseError(`Update cancelled.`, { exit: 2 });
  }
}

/**
 * Gets the sourceUrl for a given extension name and version from a registry entry
 * @param registryEntry the registry entry to look through.
 * @param name the name of the extension.
 * @param version the version of the extension. Defaults to latest.
 * @returns the source corresponding to extensionName in the registry.
 */
export function resolveSourceUrl(
  registryEntry: RegistryEntry,
  name: string,
  version?: string
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
 * Checks if the given source comes from an official extension.
 * @param registryEntry the registry entry to look through.
 * @param sourceUrl the source URL of the extension.
 */
export function isOfficialSource(registryEntry: RegistryEntry, sourceUrl: string): boolean {
  const versions = _.get(registryEntry, "versions");
  return _.includes(versions, sourceUrl);
}

/**
 * Looks up and returns a entry from the published extensions registry.
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

export function getMinRequiredVersion(registryEntry: RegistryEntry): string {
  return _.get(registryEntry, ["labels", "minRequired"]);
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
            await module.exports.confirmUpdateWarning(updateWarning);
            break;
          }
        }
        break;
      }
    }
  }
}

/**
 * Fetches the published extensions registry.
 * @param onlyFeatured If true, only return the featured extensions.
 */
export async function getExtensionRegistry(
  onlyFeatured?: boolean
): Promise<{ [key: string]: RegistryEntry }> {
  const res = await api.request("GET", EXTENSIONS_REGISTRY_ENDPOINT, {
    origin: api.firebaseExtensionsRegistryOrigin,
  });
  const extensions = _.get(res, "body.mods") as { [key: string]: RegistryEntry };

  if (onlyFeatured) {
    const featuredList = _.get(res, "body.featured.discover");
    return _.pickBy(extensions, (_entry, extensionName: string) => {
      return _.includes(featuredList, extensionName);
    });
  }
  return extensions;
}

/**
 * Fetches a list all publishers that appear in the v1 registry.
 */
export async function getTrustedPublishers(): Promise<string[]> {
  let registry: { [key: string]: RegistryEntry };
  try {
    registry = await getExtensionRegistry();
  } catch (err) {
    logger.debug(
      "Couldn't get extensions registry, assuming no trusted publishers except Firebase."
    );
    return ["firebase "];
  }
  const publisherIds = new Set<string>();

  // eslint-disable-next-line guard-for-in
  for (const entry in registry) {
    publisherIds.add(registry[entry].publisher);
  }
  return Array.from(publisherIds);
}

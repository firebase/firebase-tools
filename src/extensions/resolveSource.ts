import * as _ from "lodash";
import * as clc from "cli-color";
import * as marked from "marked";
import * as semver from "semver";
import * as api from "../api";
import { FirebaseError } from "../error";
import { confirmUpdateWarning } from "./updateHelper";
import * as logger from "../logger";
import { promptOnce } from "../prompt";

const EXTENSIONS_REGISTRY_ENDPOINT = "/extensions.json";
const AUDIENCE_WARNING_MESSAGES: { [key: string]: string } = {
  "open-alpha": marked(
    `${clc.bold("Important")}: This extension is part of the ${clc.bold(
      "preliminary-release program"
    )} for extensions.\n Its functionality might change in backward-incompatible ways before its official release. Learn more: https://github.com/firebase/extensions/tree/master/.preliminary-release-extensions`
  ),
  "closed-alpha": marked(
    `${clc.yellow.bold("Important")}: This extension is part of the ${clc.bold(
      "Firebase Alpha program"
    )}.\n This extension is strictly confidential, and its functionality might change in backward-incompatible ways before its official, public release. Learn more: https://dev-partners.googlesource.com/samples/firebase/extensions-alpha/+/refs/heads/master/README.md`
  ),
};

export interface RegistryEntry {
  icons?: { [key: string]: string };
  labels: { [key: string]: string };
  versions: { [key: string]: string };
  updateWarnings?: { [key: string]: UpdateWarning[] };
  audience?: string;
}

export interface UpdateWarning {
  from: string;
  description: string;
  action?: string;
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
 * Checks the audience field of a RegistryEntry, displays a warning text
 * for closed and open alpha extensions, and prompts the user to accept.
 */
export async function promptForAudienceConsent(registryEntry: RegistryEntry): Promise<boolean> {
  let consent = true;
  if (registryEntry.audience && AUDIENCE_WARNING_MESSAGES[registryEntry.audience]) {
    logger.info(AUDIENCE_WARNING_MESSAGES[registryEntry.audience]);
    consent = await promptOnce({
      type: "confirm",
      message: "Do you acknowledge the status of this extension?",
      default: true,
    });
  }
  return consent;
}

/**
 * Fetches the official extensions registry.
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

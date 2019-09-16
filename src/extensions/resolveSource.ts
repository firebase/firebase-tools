import * as _ from "lodash";
import * as clc from "cli-color";
import * as api from "../api";
import { FirebaseError } from "../error";

const EXTENSIONS_REGISTRY_ENDPOINT = "/extensions.json";

export interface RegistryEntry {
  name: string;
  icons?: { [key: string]: string };
  labels: { [key: string]: string };
  versions: { [key: string]: string };
}

/**
 * Gets the source for a given extension name and version from the official extensions registry
 *
 * @param extensionName the name, or name@version of the extension to get the ExtensionSource for
 * @returns the source corresponding to extensionName in the registry
 */
export async function resolveSource(extensionName: string): Promise<string> {
  const [name, version] = extensionName.split("@");
  const extensionsRegistry = await getExtensionRegistry();
  const extension = _.get(extensionsRegistry, name);
  if (!extension) {
    throw new FirebaseError(`Unable to find extension source named ${clc.bold(name)}.`);
  }
  // The version to search for when a user passes a version x.y.z or no version
  const seekVersion = version || "latest";

  // The version to search for when a user passes a label like 'latest'
  const versionFromLabel = _.get(extension, ["labels", seekVersion]);

  const source =
    _.get(extension, ["versions", seekVersion]) || _.get(extension, ["versions", versionFromLabel]);
  if (!source) {
    throw new FirebaseError(
      `Could not resolve version ${clc.bold(version)} of extension ${clc.bold(name)}.`
    );
  }
  return source;
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

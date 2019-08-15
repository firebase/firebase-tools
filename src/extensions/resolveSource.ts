import * as _ from "lodash";
import * as clc from "cli-color";
import * as api from "../api";
import { FirebaseError } from "../error";

const MODS_REGISTRY_ENDPOINT = "/mods.json";

export interface RegistryEntry {
  name: string;
  icons?: { [key: string]: string };
  labels: { [key: string]: string };
  versions: { [key: string]: string };
}

/**
 * Gets the source for a given mod name and version from the official mods registry
 *
 * @param modName the name, or name@version of the mod to get the ModSource for
 * @returns the source corresponding to modName in the registry
 */
export async function resolveSource(modName: string): Promise<string> {
  const [name, version] = modName.split("@");
  const modsRegistry = await getModRegistry();
  const mod = _.get(modsRegistry, name);
  if (!mod) {
    throw new FirebaseError(`Unable to find extension source named ${clc.bold(name)}.`);
  }
  // The version to search for when a user passes a version x.y.z or no version
  const seekVersion = version || "latest";

  // The version to search for when a user passes a label like 'latest'
  const versionFromLabel = _.get(mod, ["labels", seekVersion]);

  const source =
    _.get(mod, ["versions", seekVersion]) || _.get(mod, ["versions", versionFromLabel]);
  if (!source) {
    throw new FirebaseError(
      `Could not resolve version ${clc.bold(version)} of extension ${clc.bold(name)}.`
    );
  }
  return source;
}

/**
 * Fetches the official mods registry.
 */
async function getModRegistry(): Promise<{ [key: string]: RegistryEntry }> {
  const res = await api.request("GET", MODS_REGISTRY_ENDPOINT, {
    origin: api.firebaseModsRegistryOrigin,
  });
  return res.body.mods;
}

import * as _ from "lodash";
import { logger } from "../logger";
import { Client } from "../apiv2";
import { firebaseExtensionsRegistryOrigin } from "../api";

const EXTENSIONS_REGISTRY_ENDPOINT = "/extensions.json";

/**
 * An Entry on the deprecated registry.json list.
 */
export interface RegistryEntry {
  publisher: string;
}

/**
 * Fetches the published extensions registry.
 * @param onlyFeatured If true, only return the featured extensions.
 */
export async function getExtensionRegistry(
  onlyFeatured?: boolean
): Promise<{ [key: string]: RegistryEntry }> {
  const client = new Client({ urlPrefix: firebaseExtensionsRegistryOrigin });
  const res = await client.get(EXTENSIONS_REGISTRY_ENDPOINT);
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
  } catch (err: any) {
    logger.debug(
      "Couldn't get extensions registry, assuming no trusted publishers except Firebase."
    );
    return ["firebase"];
  }
  const publisherIds = new Set<string>();

  // eslint-disable-next-line guard-for-in
  for (const entry in registry) {
    publisherIds.add(registry[entry].publisher);
  }
  return Array.from(publisherIds);
}

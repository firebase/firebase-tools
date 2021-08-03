// This code is very aggressive about running requests in parallel and does not use
// a task queue, because the quota limits for GCR.io are absurdly high. At the time
// of writing, we can make 50K requests per 10m.
// https://cloud.google.com/container-registry/quotas

import * as clc from "cli-color";

import { containerRegistryDomain } from "../../api";
import { logger } from "../../logger";
import * as docker from "../../gcp/docker";
import * as backend from "./backend";
import * as utils from "../../utils";
import { FirebaseError } from "../../error";

// A flattening of container_registry_hosts and
// region_multiregion_map from regionconfig.borg
const SUBDOMAIN_MAPPING: Record<string, string> = {
  "us-west2": "us",
  "us-west3": "us",
  "us-west4": "us",
  "us-central1": "us",
  "us-central2": "us",
  "us-east1": "us",
  "us-east4": "us",
  "northamerica-northeast1": "us",
  "southamerica-east1": "us",
  "europe-west1": "eu",
  "europe-west2": "eu",
  "europe-west3": "eu",
  "europe-west5": "eu",
  "europe-west6": "eu",
  "europe-central2": "eu",
  "asia-east1": "asia",
  "asia-east2": "asia",
  "asia-northeast1": "asia",
  "asia-northeast2": "asia",
  "asia-northeast3": "asia",
  "asia-south1": "asia",
  "asia-southeast2": "asia",
  "australia-southeast1": "asia",
};

// The list of possible region roots or the subdomain for GCR
// The full address: <subdomain>.gcr.io/
const SUBDOMAINS: string[] = ["us", "eu", "asia"];

export async function cleanupBuildImages(functions: backend.FunctionSpec[]): Promise<void> {
  utils.logBullet(clc.bold.cyan("functions: ") + "cleaning up build files...");
  const gcrCleaner = new ContainerRegistryCleaner();
  const failedDomains: Set<string> = new Set();
  await Promise.all(
    functions.map((func) =>
      (async () => {
        try {
          await gcrCleaner.cleanupFunction(func);
        } catch (err) {
          const path = `${func.project}/${SUBDOMAIN_MAPPING[func.region]}/gcf`;
          failedDomains.add(`https://console.cloud.google.com/gcr/images/${path}`);
        }
      })()
    )
  );
  if (failedDomains.size) {
    let message =
      "Unhandled error cleaning up build images. This could result in a small monthly bill if not corrected. ";
    message +=
      "You can attempt to delete these images by redeploying or you can delete them manually at";
    if (failedDomains.size == 1) {
      message += " " + failedDomains.values().next().value;
    } else {
      message += [...failedDomains].map((domain) => "\n\t" + domain).join("");
    }
    utils.logLabeledWarning("functions", message);
  }

  // TODO: clean up Artifact Registry images as well.
}

export class ContainerRegistryCleaner {
  readonly helpers: Record<string, DockerHelper> = {};

  private helper(location: string): DockerHelper {
    const subdomain = SUBDOMAIN_MAPPING[location] || "us";
    if (!this.helpers[subdomain]) {
      const origin = `https://${subdomain}.${containerRegistryDomain}`;
      this.helpers[subdomain] = new DockerHelper(origin);
    }
    return this.helpers[subdomain];
  }

  // GCFv1 has the directory structure:
  // gcf/
  //  +- <region>/
  //        +- <uuid>
  //             +- <hash> (tags: <FuncName>_version-<#>)
  //             +- cache/ (Only present in first deploy of region)
  //             |    +- <hash> (tags: latest)
  //             +- worker/ (Only present in first deploy of region)
  //                  +- <hash> (tags: latest)
  //
  // We'll parallel search for the valid <uuid> and their children
  // until we find one with the right tag for the function name.
  // The underlying Helper's caching should make this expensive for
  // the first function and free for the next functions in the same
  // region.
  async cleanupFunction(func: backend.FunctionSpec): Promise<void> {
    const helper = this.helper(func.region);
    const uuids = (await helper.ls(`${func.project}/gcf/${func.region}`)).children;

    const uuidTags: Record<string, string[]> = {};
    const loadUuidTags: Promise<void>[] = [];
    for (const uuid of uuids) {
      loadUuidTags.push(
        (async () => {
          const path = `${func.project}/gcf/${func.region}/${uuid}`;
          const tags = (await helper.ls(path)).tags;
          uuidTags[path] = tags;
        })()
      );
    }
    await Promise.all(loadUuidTags);

    const extractFunction = /^(.*)_version-\d+$/;
    const entry = Object.entries(uuidTags).find(([, tags]) => {
      return tags.find((tag) => extractFunction.exec(tag)?.[1] === func.id);
    });

    if (!entry) {
      logger.debug("Could not find image for function", backend.functionName(func));
      return;
    }
    await helper.rm(entry[0]);
  }
}

/**
 * Helper function to flatten all docker tags from the given path to a comma separated string
 * @param dockerHelper: the specific subdomain docker helper to search GCR with
 * @param path: the relative GCR path where the tags live
 */
async function getFlattenedTags(dockerHelper: DockerHelper, path: string): Promise<string> {
  const stat = await dockerHelper.ls(path);
  const tags = stat.tags;
  return tags.length == 0 ? "" : tags.join(",");
}

/**
 * Helper function to format and insert artifact strings with tags into a set of all artifact strings
 * @param dockerHelper: the specific subdomain docker helper to search GCR with
 * @param artifacts: a list of artifact names from GCR
 * @param path: the relative GCR path that the artifacts live
 */
async function formatTagsAndInsert(
  dockerHelper: DockerHelper,
  artifactList: string[],
  path: string,
  artifacts: Set<string>
): Promise<void> {
  for (const artifact of artifactList) {
    const tags = await getFlattenedTags(dockerHelper, path + `/${artifact}`);
    const artifactEntry = tags.length === 0 ? artifact : `${artifact} - tags:${tags}`;
    artifacts.add(artifactEntry);
  }
}

/**
 * Helper function to find all relative Google Cloud Registry paths for use with searching for GCF artifacts
 * @param projectId: the current project that contains GCF artifacts
 * @param subdomain: the current subdomain that we're searching or deleting from
 * @param locations: an optional array that contains specific Google Regions. If ommited, will return the root path.
 * @returns an array of relative GCR paths.
 */
function findGCFPaths(projectId: string, subdomain: string, locations?: string[]): string[] {
  const paths: string[] = [];
  if (locations) {
    for (const location of locations) {
      if (SUBDOMAIN_MAPPING[location] !== subdomain) {
        continue;
      }
      paths.push(`${projectId}/gcf/${location}`);
    }
  } else {
    paths.push(`${projectId}/gcf`);
  }
  return paths;
}

/**
 * Helper function to find all the subdomains for the supplied locations
 * @param locations: an optional array of google cloud regions, if omitted will return all {@link SUBDOMAINS}
 * @returns a set of subdomains
 */
function getSubdomainsFromLocations(locations?: string[]): Set<string> {
  if (locations === undefined) {
    return new Set(SUBDOMAINS);
  }
  const subdomains = new Set<string>();
  for (const location of locations) {
    subdomains.add(SUBDOMAIN_MAPPING[location]);
  }
  return subdomains;
}

/**
 * List all artifacts from the GCF directory in GCR.
 * @param projectId: the current project that contains GCF artifacts
 * @param location: the specific region to search for artifacts. If omitted, will search all locations.
 * @param dockerHelpers: a map of {@link SUBDOMAINS} to {@link DockerHelper}. If omitted, will use the default value and create each {@link DockerHelper} internally.
 *
 * @throws {@link FirebaseError}
 * Thrown if the provided location is not a valid Google Cloud region or we fail to search subdomains.
 */
export async function listGCFArtifacts(
  projectId: string,
  locations?: string[],
  dockerHelpers: Record<string, DockerHelper> = {}
): Promise<Set<string>> {
  if (locations && locations.find((location) => SUBDOMAIN_MAPPING[location] === undefined)) {
    throw new FirebaseError("Invalid region supplied.");
  }

  const artifacts = new Set<string>();
  const failedSubdomains = new Set<string>();
  const subdomains = getSubdomainsFromLocations(locations);
  for (const subdomain of subdomains) {
    if (dockerHelpers[subdomain] === undefined) {
      const origin = `https://${subdomain}.${containerRegistryDomain}`;
      dockerHelpers[subdomain] = new DockerHelper(origin);
    }

    const searchPaths = findGCFPaths(projectId, subdomain, locations);
    for (const path of searchPaths) {
      try {
        const rootChildren = (await dockerHelpers[subdomain].ls(path)).children;
        if (rootChildren.length === 0) {
          continue;
        }
        // partition children into subsets that are artifacts and location dirs
        const locationDirs = rootChildren.filter((child) => SUBDOMAIN_MAPPING[child] !== undefined);
        const artifactCandidates = rootChildren.filter(
          (child) => SUBDOMAIN_MAPPING[child] === undefined
        );
        // search 1 level deeper on directories
        for (const dir of locationDirs) {
          try {
            const innerPath = path + `/${dir}`;
            const innerChildren = (await dockerHelpers[subdomain].ls(innerPath)).children;
            await formatTagsAndInsert(
              dockerHelpers[subdomain],
              innerChildren,
              innerPath,
              artifacts
            );
          } catch (err) {
            logger.debug(err);
          }
        }
        // format the artifacts with tags
        try {
          await formatTagsAndInsert(dockerHelpers[subdomain], artifactCandidates, path, artifacts);
        } catch (err) {
          logger.debug(err);
        }
      } catch (err) {
        failedSubdomains.add(subdomain);
        logger.debug(err);
      }
    }
  }

  if (failedSubdomains.size == SUBDOMAINS.length) {
    throw new FirebaseError("Failed to search all subdomains.");
  } else if (failedSubdomains.size > 0) {
    const failed: string = [...failedSubdomains].join(",");
    throw new FirebaseError(`Failed to search the following subdomains: ${failed}`);
  }

  return artifacts;
}

/**
 * Deletes all artifacts from GCF directory in GCR.
 * @param projectId: the current project that contains GCF artifacts
 * @param location: the specific region to be clean up. If omitted, will delete all locations.
 * @param dockerHelpers: a map of {@link SUBDOMAINS} to {@link DockerHelper}. If omitted, will use the default value and create each {@link DockerHelper} internally.
 *
 * @throws {@link FirebaseError}
 * Thrown if the provided location is not a valid Google Cloud region or we fail to delete subdomains.
 */
export async function deleteGCFArtifacts(
  projectId: string,
  locations?: string[],
  dockerHelpers: Record<string, DockerHelper> = {}
): Promise<void> {
  if (locations && locations.find((location) => SUBDOMAIN_MAPPING[location] === undefined)) {
    throw new FirebaseError("Invalid region supplied.");
  }

  const subdomains = getSubdomainsFromLocations(locations);
  const failedSubdomains = new Set<string>();
  for (const subdomain of subdomains) {
    if (dockerHelpers[subdomain] === undefined) {
      const origin = `https://${subdomain}.${containerRegistryDomain}`;
      dockerHelpers[subdomain] = new DockerHelper(origin);
    }

    const purgePaths = findGCFPaths(projectId, subdomain, locations);
    for (const path of purgePaths) {
      try {
        await dockerHelpers[subdomain].rm(path);
      } catch (err) {
        failedSubdomains.add(subdomain);
        logger.debug(err);
      }
    }
  }

  if (failedSubdomains.size == SUBDOMAINS.length) {
    throw new FirebaseError("Failed to delete all subdomains.");
  } else if (failedSubdomains.size > 0) {
    const failed: string = [...failedSubdomains].join(",");
    throw new FirebaseError(`Failed to delete the following subdomains: ${failed}`);
  }
}

export interface Stat {
  children: string[];
  digests: docker.Digest[];
  tags: docker.Tag[];
}

export class DockerHelper {
  readonly client: docker.Client;
  readonly cache: Record<string, Stat> = {};

  constructor(origin: string) {
    this.client = new docker.Client(origin);
  }

  async ls(path: string): Promise<Stat> {
    if (!this.cache[path]) {
      const raw = await this.client.listTags(path);
      this.cache[path] = {
        tags: raw.tags,
        digests: Object.keys(raw.manifest),
        children: raw.child,
      };
    }
    return this.cache[path];
  }

  // While we can't guarantee all promises will succeed, we can do our darndest
  // to expunge as much as possible before throwing.
  async rm(path: string): Promise<void> {
    let toThrowLater: any = undefined;
    const stat = await this.ls(path);
    const recursive = stat.children.map((child) =>
      (async () => {
        try {
          await this.rm(`${path}/${child}`);
          stat.children.splice(stat.children.indexOf(child), 1);
        } catch (err) {
          toThrowLater = err;
        }
      })()
    );
    // Unlike a filesystem, we can delete a "directory" while its children are still being
    // deleted. Run these in parallel to improve performance and just wait for the result
    // before the function's end.

    // An image cannot be deleted until its tags have been removed. Do this in two phases.
    const deleteTags = stat.tags.map((tag) =>
      (async () => {
        try {
          await this.client.deleteTag(path, tag);
          stat.tags.splice(stat.tags.indexOf(tag), 1);
        } catch (err) {
          logger.debug("Got error trying to remove docker tag:", err);
          toThrowLater = err;
        }
      })()
    );
    await Promise.all(deleteTags);

    const deleteImages = stat.digests.map((digest) =>
      (async () => {
        try {
          await this.client.deleteImage(path, digest);
          stat.digests.splice(stat.digests.indexOf(digest), 1);
        } catch (err) {
          logger.debug("Got error trying to remove docker image:", err);
          toThrowLater = err;
        }
      })()
    );
    await Promise.all(deleteImages);

    await Promise.all(recursive);

    if (toThrowLater) {
      throw toThrowLater;
    }
  }
}

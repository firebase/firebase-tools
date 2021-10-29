// This code is very aggressive about running requests in parallel and does not use
// a task queue, because the quota limits for GCR.io are absurdly high. At the time
// of writing, we can make 50K requests per 10m.
// https://cloud.google.com/container-registry/quotas

import * as clc from "cli-color";

import { FirebaseError } from "../../error";
import { previews } from "../../previews";
import { artifactRegistryDomain, containerRegistryDomain } from "../../api";
import { logger } from "../../logger";
import * as artifactregistry from "../../gcp/artifactregistry";
import * as backend from "./backend";
import * as docker from "../../gcp/docker";
import * as utils from "../../utils";
import * as poller from "../../operation-poller";

// A flattening of container_registry_hosts and
// region_multiregion_map from regionconfig.borg
export const SUBDOMAIN_MAPPING: Record<string, string> = {
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

async function retry<Return>(func: () => Promise<Return>): Promise<Return> {
  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
  const MAX_RETRIES = 3;
  const INITIAL_BACKOFF = 100;
  const TIMEOUT_MS = 10_000;
  let retry = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const timeout = new Promise<Return>((resolve, reject) => {
        setTimeout(() => reject(new Error("Timeout")), TIMEOUT_MS);
      });
      return await Promise.race([func(), timeout]);
    } catch (error) {
      logger.debug("Failed docker command with error ", error);
      retry += 1;
      if (retry >= MAX_RETRIES) {
        throw new FirebaseError("Failed to clean up artifacts", { original: error });
      }
      await sleep(Math.pow(INITIAL_BACKOFF, retry - 1));
    }
  }
}

export async function cleanupBuildImages(
  haveFunctions: backend.TargetIds[],
  deletedFunctions: backend.TargetIds[],
  cleaners: { gcr?: ContainerRegistryCleaner; ar?: ArtifactRegistryCleaner } = {}
): Promise<void> {
  utils.logBullet(clc.bold.cyan("functions: ") + "cleaning up build files...");
  const failedDomains: Set<string> = new Set();
  if (previews.artifactregistry) {
    const arCleaner = cleaners.ar || new ArtifactRegistryCleaner();
    await Promise.all([
      ...haveFunctions.map(async (func) => {
        try {
          await arCleaner.cleanupFunction(func);
        } catch (err) {
          const path = `${func.project}/${func.region}/gcf-artifacts`;
          failedDomains.add(`https://console.cloud.google.com/artifacts/docker/${path}`);
        }
      }),
      ...deletedFunctions.map(async (func) => {
        try {
          await Promise.all([
            arCleaner.cleanupFunction(func),
            arCleaner.cleanupFunctionCache(func),
          ]);
        } catch (err) {
          const path = `${func.project}/${func.region}/gcf-artifacts`;
          failedDomains.add(`https://console.cloud.google.com/artifacts/docker/${path}`);
        }
      }),
    ]);
  } else {
    const gcrCleaner = cleaners.gcr || new ContainerRegistryCleaner();
    await Promise.all(
      [...haveFunctions, ...deletedFunctions].map(async (func) => {
        try {
          await gcrCleaner.cleanupFunction(func);
        } catch (err) {
          const path = `${func.project}/${SUBDOMAIN_MAPPING[func.region]}/gcf`;
          failedDomains.add(`https://console.cloud.google.com/gcr/images/${path}`);
        }
      })
    );
  }
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
}

// TODO: AR has a very simple API but is a Google API and thus probably has much lower quotas
// than the raw Docker API. If there are reports of any quota issues we may have to run these
// requests through a ThrottlerQueue.
export class ArtifactRegistryCleaner {
  static packagePath(func: backend.TargetIds): string {
    return `projects/${func.project}/locations/${func.region}/repositories/gcf-artifacts/packages/${func.id}`;
  }

  static POLLER_OPTIONS = {
    apiOrigin: artifactRegistryDomain,
    apiVersion: artifactregistry.API_VERSION,
    masterTimeout: 5 * 60 * 1_000,
  };

  // GCFv1 for AR has the following directory structure
  // Hostname: <region>-docker.pkg.dev
  // Directory structure:
  // gcf-artifacts/
  //     +- <function ID>
  //     +- <function ID>/cache
  // We leave the cache directory alone because it only costs
  // a few MB and improves performance. We only delete the cache if
  // the function was deleted in its entirety.
  async cleanupFunction(func: backend.TargetIds): Promise<void> {
    const op = await artifactregistry.deletePackage(ArtifactRegistryCleaner.packagePath(func));
    if (op.done) {
      return;
    }
    await poller.pollOperation<void>({
      ...ArtifactRegistryCleaner.POLLER_OPTIONS,
      pollerName: `cleanup-${func.region}-${func.id}`,
      operationResourceName: op.name,
    });
  }

  async cleanupFunctionCache(func: backend.TargetIds): Promise<void> {
    // GCF uses "<id>/cache" as their pacakge name, but AR percent-encodes this to
    // avoid parsing issues with OP.
    const op = await artifactregistry.deletePackage(
      `${ArtifactRegistryCleaner.packagePath(func)}%2Fcache`
    );
    if (op.done) {
      return;
    }
    await poller.pollOperation<void>({
      ...ArtifactRegistryCleaner.POLLER_OPTIONS,
      pollerName: `cleanup-cache-${func.region}-${func.id}`,
      operationResourceName: op.name,
    });
  }
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
  async cleanupFunction(func: backend.TargetIds): Promise<void> {
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

function getHelper(cache: Record<string, DockerHelper>, subdomain: string): DockerHelper {
  if (!cache[subdomain]) {
    cache[subdomain] = new DockerHelper(`https://${subdomain}.${containerRegistryDomain}`);
  }
  return cache[subdomain];
}

/**
 * List all paths from the GCF directory in GCR (e.g. us.gcr.io/project-id/gcf/location).
 * @param projectId: the current project that contains GCF artifacts
 * @param location: the specific region to search for artifacts. If omitted, will search all locations.
 * @param dockerHelpers: a map of {@link SUBDOMAINS} to {@link DockerHelper}. If omitted, will use the default value and create each {@link DockerHelper} internally.
 *
 * @throws {@link FirebaseError}
 * Thrown if the provided location is not a valid Google Cloud region or we fail to search subdomains.
 */
export async function listGcfPaths(
  projectId: string,
  locations?: string[],
  dockerHelpers: Record<string, DockerHelper> = {}
): Promise<string[]> {
  if (!locations) {
    locations = Object.keys(SUBDOMAIN_MAPPING);
  }
  const invalidRegion = locations.find((loc) => !SUBDOMAIN_MAPPING[loc]);
  if (invalidRegion) {
    throw new FirebaseError(`Invalid region ${invalidRegion} supplied`);
  }
  const locationsSet = new Set(locations); // for quick lookup
  const subdomains = new Set(Object.values(SUBDOMAIN_MAPPING));
  const failedSubdomains: string[] = [];
  const listAll: Promise<Stat>[] = [];

  for (const subdomain of subdomains) {
    listAll.push(
      (async () => {
        try {
          return getHelper(dockerHelpers, subdomain).ls(`${projectId}/gcf`);
        } catch (err) {
          failedSubdomains.push(subdomain);
          logger.debug(err);
          const stat: Stat = {
            children: [],
            digests: [],
            tags: [],
          };
          return Promise.resolve(stat);
        }
      })()
    );
  }

  const gcfDirs = (await Promise.all(listAll))
    .map((results) => results.children)
    .reduce((acc, val) => [...acc, ...val], [])
    .filter((loc) => locationsSet.has(loc));

  if (failedSubdomains.length == subdomains.size) {
    throw new FirebaseError("Failed to search all subdomains.");
  } else if (failedSubdomains.length > 0) {
    throw new FirebaseError(
      `Failed to search the following subdomains: ${failedSubdomains.join(",")}`
    );
  }

  return gcfDirs.map((loc) => {
    return `${SUBDOMAIN_MAPPING[loc]}.${containerRegistryDomain}/${projectId}/gcf/${loc}`;
  });
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
export async function deleteGcfArtifacts(
  projectId: string,
  locations?: string[],
  dockerHelpers: Record<string, DockerHelper> = {}
): Promise<void> {
  if (!locations) {
    locations = Object.keys(SUBDOMAIN_MAPPING);
  }
  const invalidRegion = locations.find((loc) => !SUBDOMAIN_MAPPING[loc]);
  if (invalidRegion) {
    throw new FirebaseError(`Invalid region ${invalidRegion} supplied`);
  }
  const subdomains = new Set(Object.values(SUBDOMAIN_MAPPING));
  const failedSubdomains: string[] = [];

  const deleteLocations = locations.map((loc) => {
    try {
      return getHelper(dockerHelpers, SUBDOMAIN_MAPPING[loc]).rm(`${projectId}/gcf/${loc}`);
    } catch (err) {
      failedSubdomains.push(SUBDOMAIN_MAPPING[loc]);
      logger.debug(err);
    }
  });
  await Promise.all(deleteLocations);

  if (failedSubdomains.length == subdomains.size) {
    throw new FirebaseError("Failed to search all subdomains.");
  } else if (failedSubdomains.length > 0) {
    throw new FirebaseError(
      `Failed to search the following subdomains: ${failedSubdomains.join(",")}`
    );
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
      const raw = await retry(() => this.client.listTags(path));
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
    let toThrowLater: unknown = undefined;
    const stat = await this.ls(path);
    const recursive = stat.children.map(async (child) => {
      try {
        await this.rm(`${path}/${child}`);
        stat.children.splice(stat.children.indexOf(child), 1);
      } catch (err) {
        toThrowLater = err;
      }
    });
    // Unlike a filesystem, we can delete a "directory" while its children are still being
    // deleted. Run these in parallel to improve performance and just wait for the result
    // before the function's end.

    // An image cannot be deleted until its tags have been removed. Do this in two phases.
    const deleteTags = stat.tags.map(async (tag) => {
      try {
        await retry(() => this.client.deleteTag(path, tag));
        stat.tags.splice(stat.tags.indexOf(tag), 1);
      } catch (err) {
        logger.debug("Got error trying to remove docker tag:", err);
        toThrowLater = err;
      }
    });
    await Promise.all(deleteTags);

    const deleteImages = stat.digests.map(async (digest) => {
      try {
        await retry(() => this.client.deleteImage(path, digest));
        stat.digests.splice(stat.digests.indexOf(digest), 1);
      } catch (err) {
        logger.debug("Got error trying to remove docker image:", err);
        toThrowLater = err;
      }
    });
    await Promise.all(deleteImages);

    await Promise.all(recursive);

    if (toThrowLater) {
      throw toThrowLater;
    }
  }
}

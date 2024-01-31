// This code is very aggressive about running requests in parallel and does not use
// a task queue, because the quota limits for GCR.io are absurdly high. At the time
// of writing, we can make 50K requests per 10m.
// https://cloud.google.com/container-registry/quotas

import * as clc from "colorette";

import { FirebaseError } from "../../error";
import { artifactRegistryDomain, containerRegistryDomain } from "../../api";
import { logger } from "../../logger";
import * as artifactregistry from "../../gcp/artifactregistry";
import * as backend from "./backend";
import * as docker from "../../gcp/docker";
import * as utils from "../../utils";
import * as poller from "../../operation-poller";

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
    } catch (err: any) {
      logger.debug("Failed docker command with error ", err);
      retry += 1;
      if (retry >= MAX_RETRIES) {
        throw new FirebaseError("Failed to clean up artifacts", { original: err });
      }
      await sleep(Math.pow(INITIAL_BACKOFF, retry - 1));
    }
  }
}

export async function cleanupBuildImages(
  haveFunctions: backend.TargetIds[],
  deletedFunctions: backend.TargetIds[],
  cleaners: { gcr?: ContainerRegistryCleaner; ar?: ArtifactRegistryCleaner } = {},
): Promise<void> {
  utils.logBullet(clc.bold(clc.cyan("functions: ")) + "cleaning up build files...");
  const failedDomains: Set<string> = new Set();
  const cleanup: Array<Promise<void>> = [];
  const arCleaner = cleaners.ar || new ArtifactRegistryCleaner();
  // Whether the container was stored in GCR or AR is up to a server-side experiment;
  // clean up both, just in case.
  // TODO: remove GCR path once the experiment is rollack-safe.
  cleanup.push(
    ...haveFunctions.map(async (func) => {
      try {
        await arCleaner.cleanupFunction(func);
      } catch (err: any) {
        const path = `${func.project}/${func.region}/gcf-artifacts`;
        failedDomains.add(`https://console.cloud.google.com/artifacts/docker/${path}`);
      }
    }),
  );
  cleanup.push(
    ...deletedFunctions.map(async (func) => {
      try {
        await Promise.all([arCleaner.cleanupFunction(func), arCleaner.cleanupFunctionCache(func)]);
      } catch (err: any) {
        const path = `${func.project}/${func.region}/gcf-artifacts`;
        failedDomains.add(`https://console.cloud.google.com/artifacts/docker/${path}`);
      }
    }),
  );
  const gcrCleaner = cleaners.gcr || new ContainerRegistryCleaner();
  cleanup.push(
    ...[...haveFunctions, ...deletedFunctions].map(async (func) => {
      try {
        await gcrCleaner.cleanupFunction(func);
      } catch (err: any) {
        const path = `${func.project}/${docker.GCR_SUBDOMAIN_MAPPING[func.region]}/gcf`;
        failedDomains.add(`https://console.cloud.google.com/gcr/images/${path}`);
      }
    }),
  );
  await Promise.all(cleanup);
  if (failedDomains.size) {
    let message =
      "Unhandled error cleaning up build images. This could result in a small monthly bill if not corrected. ";
    message +=
      "You can attempt to delete these images by redeploying or you can delete them manually at";
    if (failedDomains.size === 1) {
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
    // GCFv1 names can include upper-case letters, but docker images cannot.
    // to fix this, the artifact registry path for these images uses a custom encoding scheme.
    // * Underscores are doubled
    // * Dashes are doubled
    // * A leading capital letter is replaced with <lower><dash><lower>
    // * Other capital letters are replaced with <underscore><lower>
    const encodedId = func.id
      .replace(/_/g, "__")
      .replace(/-/g, "--")
      .replace(/^[A-Z]/, (first) => `${first.toLowerCase()}-${first.toLowerCase()}`)
      .replace(/[A-Z]/g, (upper) => `_${upper.toLowerCase()}`);
    return `projects/${func.project}/locations/${func.region}/repositories/gcf-artifacts/packages/${encodedId}`;
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
    let op: artifactregistry.Operation;
    try {
      op = await artifactregistry.deletePackage(ArtifactRegistryCleaner.packagePath(func));
    } catch (err: any) {
      // The client was not enrolled in the AR experimenet and the package
      // was missing
      if (err.status === 404) {
        return;
      }
      throw err;
    }
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
      `${ArtifactRegistryCleaner.packagePath(func)}%2Fcache`,
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

// Temporary class to turn off AR cleaning if AR isn't enabled yet
export class NoopArtifactRegistryCleaner extends ArtifactRegistryCleaner {
  cleanupFunction(): Promise<void> {
    return Promise.resolve();
  }

  cleanupFunctionCache(): Promise<void> {
    return Promise.resolve();
  }
}

export class ContainerRegistryCleaner {
  readonly helpers: Record<string, DockerHelper> = {};

  private helper(location: string): DockerHelper {
    const subdomain = docker.GCR_SUBDOMAIN_MAPPING[location] || "us";
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
        })(),
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
 * @throws {@link FirebaseError}
 * Thrown if the provided location is not a valid Google Cloud region or we fail to search subdomains.
 */
export async function listGcfPaths(
  projectId: string,
  locations?: string[],
  dockerHelpers: Record<string, DockerHelper> = {},
): Promise<string[]> {
  if (!locations) {
    locations = Object.keys(docker.GCR_SUBDOMAIN_MAPPING);
  }
  const invalidRegion = locations.find((loc) => !docker.GCR_SUBDOMAIN_MAPPING[loc]);
  if (invalidRegion) {
    throw new FirebaseError(`Invalid region ${invalidRegion} supplied`);
  }
  const locationsSet = new Set(locations); // for quick lookup
  const subdomains = new Set(Object.values(docker.GCR_SUBDOMAIN_MAPPING));
  const failedSubdomains: string[] = [];
  const listAll: Promise<Stat>[] = [];

  for (const subdomain of subdomains) {
    listAll.push(
      (async () => {
        try {
          return getHelper(dockerHelpers, subdomain).ls(`${projectId}/gcf`);
        } catch (err: any) {
          failedSubdomains.push(subdomain);
          logger.debug(err);
          const stat: Stat = {
            children: [],
            digests: [],
            tags: [],
          };
          return Promise.resolve(stat);
        }
      })(),
    );
  }

  const gcfDirs = (await Promise.all(listAll))
    .map((results) => results.children)
    .reduce((acc, val) => [...acc, ...val], [])
    .filter((loc) => locationsSet.has(loc));

  if (failedSubdomains.length === subdomains.size) {
    throw new FirebaseError("Failed to search all subdomains.");
  } else if (failedSubdomains.length > 0) {
    throw new FirebaseError(
      `Failed to search the following subdomains: ${failedSubdomains.join(",")}`,
    );
  }

  return gcfDirs.map((loc) => {
    return `${docker.GCR_SUBDOMAIN_MAPPING[loc]}.${containerRegistryDomain}/${projectId}/gcf/${loc}`;
  });
}

/**
 * Deletes all artifacts from GCF directory in GCR.
 * @param projectId: the current project that contains GCF artifacts
 * @param location: the specific region to be clean up. If omitted, will delete all locations.
 * @param dockerHelpers: a map of {@link SUBDOMAINS} to {@link DockerHelper}. If omitted, will use the default value and create each {@link DockerHelper} internally.
 * @throws {@link FirebaseError}
 * Thrown if the provided location is not a valid Google Cloud region or we fail to delete subdomains.
 */
export async function deleteGcfArtifacts(
  projectId: string,
  locations?: string[],
  dockerHelpers: Record<string, DockerHelper> = {},
): Promise<void> {
  if (!locations) {
    locations = Object.keys(docker.GCR_SUBDOMAIN_MAPPING);
  }
  const invalidRegion = locations.find((loc) => !docker.GCR_SUBDOMAIN_MAPPING[loc]);
  if (invalidRegion) {
    throw new FirebaseError(`Invalid region ${invalidRegion} supplied`);
  }
  const subdomains = new Set(Object.values(docker.GCR_SUBDOMAIN_MAPPING));
  const failedSubdomains: string[] = [];

  const deleteLocations = locations.map((loc) => {
    const subdomain = docker.GCR_SUBDOMAIN_MAPPING[loc]!;
    try {
      return getHelper(dockerHelpers, subdomain).rm(`${projectId}/gcf/${loc}`);
    } catch (err: any) {
      failedSubdomains.push(subdomain);
      logger.debug(err);
    }
  });
  await Promise.all(deleteLocations);

  if (failedSubdomains.length === subdomains.size) {
    throw new FirebaseError("Failed to search all subdomains.");
  } else if (failedSubdomains.length > 0) {
    throw new FirebaseError(
      `Failed to search the following subdomains: ${failedSubdomains.join(",")}`,
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
  readonly cache: Record<string, Promise<Stat>> = {};

  constructor(origin: string) {
    this.client = new docker.Client(origin);
  }

  // N.B. It is very important that this function assigns to the cache before
  // yielding the runloop or parallel executions will race their LS calls, which
  // are each recursive, leading to possible N^2 executions.
  async ls(path: string): Promise<Stat> {
    if (!(path in this.cache)) {
      this.cache[path] = retry(() => this.client.listTags(path)).then((res) => {
        return {
          tags: res.tags,
          digests: Object.keys(res.manifest),
          children: res.child,
        };
      });
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
      } catch (err: any) {
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
      } catch (err: any) {
        logger.debug("Got error trying to remove docker tag:", err);
        toThrowLater = err;
      }
    });
    await Promise.all(deleteTags);

    const deleteImages = stat.digests.map(async (digest) => {
      try {
        await retry(() => this.client.deleteImage(path, digest));
        stat.digests.splice(stat.digests.indexOf(digest), 1);
      } catch (err: any) {
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

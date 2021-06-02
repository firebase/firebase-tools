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

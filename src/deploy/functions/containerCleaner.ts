// This code is very aggressive about running requests in parallel and does not use
// a task queue, because the quota limits for GCR.io are absurdly high. At the time
// of writing, we can make 50K requests per 10m.
// https://cloud.google.com/container-registry/quotas

import * as clc from "cli-color";

import { logger } from "../../logger";
import * as gcr from "../../gcp/containerregistry";
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
  try {
    await Promise.all(functions.map((func) => gcrCleaner.cleanupFunction(func)));
  } catch (err) {
    logger.debug("Failed to delete container registry artifacts with error", err);
    utils.logLabeledWarning(
      "functions",
      "Unhnandled error cleaning up build files. This could result in a small monthly bill if not corrected"
    );
  }

  // TODO: clean up Artifact Registry images as well.
}

export class ContainerRegistryCleaner {
  readonly helpers: Record<string, ContainerRegistryHelper> = {};

  private helper(location: string): ContainerRegistryHelper {
    const subdomain = SUBDOMAIN_MAPPING[location] || "us";
    if (!this.helpers[subdomain]) {
      this.helpers[subdomain] = new ContainerRegistryHelper(subdomain);
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
      return tags.find((tag) => {
        const match = tag.match(extractFunction);
        return match && match[1] === func.id;
      });
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
  digests: gcr.Digest[];
  tags: gcr.Tag[];
}

export interface Node {
  // If we haven't actually done an LS on this exact location
  sparse: boolean;

  // For directories
  children: Record<string, Node>;

  // For images
  digests: gcr.Digest[];
  tags: gcr.Tag[];
}

export class ContainerRegistryHelper {
  readonly client: gcr.Client;
  readonly cache: Node;

  constructor(subdomain: string) {
    this.client = new gcr.Client(subdomain);
    this.cache = {
      sparse: true,
      children: {},
      digests: [],
      tags: [],
    };
  }

  private async getNode(path: string): Promise<Node> {
    const parts = path.split("/");
    let cwd = this.cache;
    for (const part of parts) {
      if (!cwd.children[part]) {
        cwd.children[part] = {
          sparse: true,
          children: {},
          digests: [],
          tags: [],
        };
      }
      cwd = cwd.children[part];
    }
    if (cwd.sparse) {
      const raw = await this.client.listTags(path);
      cwd.sparse = false;
      cwd.tags = raw.tags;
      cwd.digests = Object.keys(raw.manifest);
      cwd.children = {};
      for (const child of raw.child) {
        cwd.children[child] = {
          sparse: true,
          children: {},
          digests: [],
          tags: [],
        };
      }
    }
    return cwd;
  }

  async ls(path: string): Promise<Stat> {
    const node = await this.getNode(path);
    return {
      children: Object.keys(node.children),
      digests: node.digests,
      tags: node.tags,
    };
  }

  async rm(path: string): Promise<void> {
    const node = await this.getNode(path);
    const deleteChildren: Promise<void>[] = [];
    const recursive = Object.keys(node.children).map((child) => this.rm(`${path}/${child}`));
    // Let children ("directories") be cleaned up in parallel while we clean
    // up the "files" in this location.

    const deleteTags = node.tags.map((tag) => this.client.deleteTag(path, tag));
    await Promise.all(deleteTags);
    node.tags = [];

    const deleteImages = node.digests.map((digest) => this.client.deleteImage(path, digest));
    await Promise.all(deleteImages);
    node.digests = [];

    await Promise.all(recursive);
    node.children = {};
  }
}

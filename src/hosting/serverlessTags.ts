import * as run from "../gcp/run";
import * as api from "./api";
import { FirebaseError } from "../error";
import { flattenArray } from "../functional";
import * as utils from "../utils";
import { logger } from "../logger";

/**
 * Sentinel to be used when creating an api.Rewrite with the tag option but
 * you don't yet know the tag. Resolve this tag by passing the rewrite into
 * setRewriteTags
 */
export const TODO_TAG_NAME = "this is an invalid tag name so it cannot be real";
/**
 * Looks up all valid Hosting tags in this project and removes traffic targets
 * from passed in services that don't match a valid tag.
 * This makes no actual server-side changes to these services; you must then
 * call run.updateService to save these changes. We divide this responsiblity
 * because we want to possibly insert a new tagged target before saving.
 */
export async function gcTagsForServices(project: string, services: run.Service[]): Promise<void> {
  utils.logLabeledBullet("hosting", "Cleaning up unused tags for Run services");

  // region -> service -> tags
  // We cannot simplify this into a single map because we might be mixing project
  // id and number.
  const validTags: Record<string, Record<string, Set<string>>> = {};
  const sites = await api.listSites(project);
  const allVersionsNested = await Promise.all(sites.map((site) => api.listVersions(site.name)));
  const activeVersions = [...flattenArray(allVersionsNested)].filter((version) => {
    return version.status === "CREATED" || version.status === "FINALIZED";
  });
  for (const version of activeVersions) {
    for (const rewrite of version.config.rewrites || []) {
      if (!("run" in rewrite) || !rewrite.run.tag) {
        continue;
      }
      validTags[rewrite.run.region] = validTags[rewrite.run.region] || {};
      validTags[rewrite.run.region][rewrite.run.serviceId] =
        validTags[rewrite.run.region][rewrite.run.serviceId] || new Set<string>();
      validTags[rewrite.run.region][rewrite.run.serviceId].add(rewrite.run.tag);
    }
  }

  // Erase all traffic targets that have an expired tag and no serving percentage
  for (const service of services) {
    const parts = service.metadata.name.split("/");
    const region = parts[3];
    const serviceId = parts[5];
    service.spec.traffic = (service.spec.traffic || [])
      .map((traffic) => {
        // If we're serving traffic irrespective of the tag, leave this target
        if (traffic.percent) {
          return traffic;
        }
        // Only GC targets with tags
        if (!traffic.tag) {
          return traffic;
        }
        // Only GC targets with tags that look like we added them
        if (!traffic.tag.startsWith("fh-")) {
          return traffic;
        }
        if (validTags[region][serviceId].has(traffic.tag)) {
          return traffic;
        }
        return null;
      })
      // Note: the filter command doesn't update the type info to drop null
      .filter((t) => t !== null) as run.TrafficTarget[];
  }
}

// The number of tags after which we start applying GC pressure.
export const garbageCollectionThreshold = 500;

/**
 * Ensures that all the listed run versions have pins.
 */
export async function setRewriteTags(
  rewrites: api.Rewrite[],
  project: string,
  version: string
): Promise<void> {
  // Note: this is sub-optimal in the case where there are multiple rewrites
  // to the same service. Should we deduplicate this?
  const services: run.Service[] = await Promise.all(
    rewrites
      .map((rewrite) => {
        if (!("run" in rewrite)) {
          return null;
        }
        if (rewrite.run.tag !== "__TODO__") {
          return null;
        }

        return run.getService(
          `projects/${project}/locations/${rewrite.run.region}/services/${rewrite.run.serviceId}`
        );
      })
      // filter does not drop the null annotation
      .filter((s) => s !== null) as Array<Promise<run.Service>>
  );

  const needsGC = services
    .map((service) => {
      return service.spec.traffic.filter((traffic) => traffic.tag).length;
    })
    .some((length) => length > garbageCollectionThreshold);
  if (needsGC) {
    await exports.gcTagsForServices(project, services);
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const tags: Record<string, Record<string, string>> = exports.ensureLatestRevisionTagged(
    services,
    `fh-${version}`
  );
  for (const rewrite of rewrites) {
    if (!("run" in rewrite) || rewrite.run.tag !== "__TODO__") {
      continue;
    }
    const tag = tags[rewrite.run.region][rewrite.run.serviceId];
    // Swap these lines to launch the feature
    // rewrite.run.tag = tag;
    logger.info(`Pretending to pin rewrite to service ${rewrite.run.serviceId} to tag ${tag}`);
    delete rewrite.run.tag;
  }
}

/**
 * Given an already fetched service, ensures that the latest revision
 * has a tagged traffic target.
 * If the service does not have a tagged target already, the service will be modified
 * to include a new target and the change will be publisehd to prod.
 * Returns a map of region to map of service to latest tag.
 */
export async function ensureLatestRevisionTagged(
  services: run.Service[],
  defaultTag: string
): Promise<Record<string, Record<string, string>>> {
  // Region -> Service -> Tag
  const tags: Record<string, Record<string, string>> = {};
  const updateServices: Array<Promise<unknown>> = [];
  for (const service of services) {
    const parts = service.metadata.name.split("/");
    const region = parts[3];
    const serviceId = parts[5];
    tags[region] = tags[region] || {};
    const latestRevisionTarget = service.status?.traffic.find((target) => target.latestRevision);
    if (!latestRevisionTarget) {
      throw new FirebaseError(
        `Assertion failed: service ${service.metadata.name} has no latestRevision traffic target`
      );
    }
    const latestRevision = latestRevisionTarget.revisionName;
    const alreadyTagged = service.spec.traffic.find(
      (target) => target.revisionName === latestRevision && target.tag
    );
    if (alreadyTagged) {
      tags[region][serviceId] = alreadyTagged.tag!;
      continue;
    }
    tags[region][serviceId] = defaultTag;
    service.spec.traffic.push({
      revisionName: latestRevision,
      tag: defaultTag,
    });
    updateServices.push(run.updateService(service.metadata.name, service));
  }

  await Promise.all(updateServices);
  return tags;
}

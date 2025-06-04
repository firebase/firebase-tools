import { posix } from "node:path";
import * as run from "../gcp/run";
import * as api from "./api";
import { FirebaseError } from "../error";
import { flattenArray } from "../functional";

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
  // region -> service -> tags
  // We cannot simplify this into a single map because we might be mixing project
  // id and number.
  const validTagsByServiceByRegion: Record<string, Record<string, Set<string>>> = {};
  const sites = await api.listSites(project);
  const allVersionsNested = await Promise.all(
    sites.map((site) => api.listVersions(posix.basename(site.name))),
  );
  const activeVersions = [...flattenArray(allVersionsNested)].filter((version) => {
    return version.status === "CREATED" || version.status === "FINALIZED";
  });
  for (const version of activeVersions) {
    for (const rewrite of version?.config?.rewrites || []) {
      if (!("run" in rewrite) || !rewrite.run.tag) {
        continue;
      }
      validTagsByServiceByRegion[rewrite.run.region] =
        validTagsByServiceByRegion[rewrite.run.region] || {};
      validTagsByServiceByRegion[rewrite.run.region][rewrite.run.serviceId] =
        validTagsByServiceByRegion[rewrite.run.region][rewrite.run.serviceId] || new Set<string>();
      validTagsByServiceByRegion[rewrite.run.region][rewrite.run.serviceId].add(rewrite.run.tag);
    }
  }

  // Erase all traffic targets that have an expired tag and no serving percentage
  for (const service of services) {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    const { region, serviceId } = run.gcpIds(service);
    service.spec.traffic = (service.spec.traffic || []).filter((traffic) => {
      // If we're serving traffic irrespective of the tag, leave this target
      if (traffic.percent) {
        return true;
      }
      // Only GC targets with tags
      if (!traffic.tag) {
        return true;
      }
      // Only GC targets with tags that look like we added them
      if (!traffic.tag.startsWith("fh-")) {
        return true;
      }
      if (validTagsByServiceByRegion[region]?.[serviceId]?.has(traffic.tag)) {
        return true;
      }
      return false;
    });
  }
}

// The number of tags after which we start applying GC pressure.
let garbageCollectionThreshold = 500;

/**
 * Sets the garbage collection threshold for testing.
 * @param threshold new GC threshold.
 */
export function setGarbageCollectionThreshold(threshold: number): void {
  garbageCollectionThreshold = threshold;
}

/**
 * Ensures that all the listed run versions have pins.
 */
export async function setRewriteTags(
  rewrites: api.Rewrite[],
  project: string,
  version: string,
): Promise<void> {
  // Note: this is sub-optimal in the case where there are multiple rewrites
  // to the same service. Should we deduplicate this?
  const services: run.Service[] = await Promise.all(
    rewrites
      .map((rewrite) => {
        if (!("run" in rewrite)) {
          return null;
        }
        if (rewrite.run.tag !== TODO_TAG_NAME) {
          return null;
        }

        return run.getService(
          `projects/${project}/locations/${rewrite.run.region}/services/${rewrite.run.serviceId}`,
        );
      })
      // filter does not drop the null annotation
      .filter((s) => s !== null) as Array<Promise<run.Service>>,
  );
  // Unnecessary due to functional programming, but creates an observable side effect for tests
  if (!services.length) {
    return;
  }

  const needsGC = services
    .map((service) => {
      return service.spec.traffic.filter((traffic) => traffic.tag).length;
    })
    .some((length) => length >= garbageCollectionThreshold);
  if (needsGC) {
    await exports.gcTagsForServices(project, services);
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const tags: Record<string, Record<string, string>> = await exports.ensureLatestRevisionTagged(
    services,
    `fh-${version}`,
  );
  for (const rewrite of rewrites) {
    if (!("run" in rewrite) || rewrite.run.tag !== TODO_TAG_NAME) {
      continue;
    }
    const tag = tags[rewrite.run.region][rewrite.run.serviceId];
    rewrite.run.tag = tag;
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
  defaultTag: string,
): Promise<Record<string, Record<string, string>>> {
  // Region -> Service -> Tag
  const tags: Record<string, Record<string, string>> = {};
  const updateServices: Array<Promise<unknown>> = [];
  for (const service of services) {
    const { projectNumber, region, serviceId } = run.gcpIds(service);
    tags[region] = tags[region] || {};
    const latestRevision = service.status?.latestReadyRevisionName;
    if (!latestRevision) {
      throw new FirebaseError(
        `Assertion failed: service ${service.metadata.name} has no ready revision`,
      );
    }
    const alreadyTagged = service.spec.traffic.find(
      (target) => target.revisionName === latestRevision && target.tag,
    );
    if (alreadyTagged) {
      // Null assertion is safe because the predicate that found alreadyTagged
      // checked for tag.
      tags[region][serviceId] = alreadyTagged.tag!;
      continue;
    }
    tags[region][serviceId] = defaultTag;
    service.spec.traffic.push({
      revisionName: latestRevision,
      tag: defaultTag,
    });
    updateServices.push(
      run.updateService(
        `projects/${projectNumber}/locations/${region}/services/${serviceId}`,
        service,
      ),
    );
  }

  await Promise.all(updateServices);
  return tags;
}

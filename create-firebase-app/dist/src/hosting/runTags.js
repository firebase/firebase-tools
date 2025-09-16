"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureLatestRevisionTagged = exports.setRewriteTags = exports.setGarbageCollectionThreshold = exports.gcTagsForServices = exports.TODO_TAG_NAME = void 0;
const node_path_1 = require("node:path");
const run = require("../gcp/run");
const api = require("./api");
const error_1 = require("../error");
const functional_1 = require("../functional");
/**
 * Sentinel to be used when creating an api.Rewrite with the tag option but
 * you don't yet know the tag. Resolve this tag by passing the rewrite into
 * setRewriteTags
 */
exports.TODO_TAG_NAME = "this is an invalid tag name so it cannot be real";
/**
 * Looks up all valid Hosting tags in this project and removes traffic targets
 * from passed in services that don't match a valid tag.
 * This makes no actual server-side changes to these services; you must then
 * call run.updateService to save these changes. We divide this responsiblity
 * because we want to possibly insert a new tagged target before saving.
 */
async function gcTagsForServices(project, services) {
    var _a;
    // region -> service -> tags
    // We cannot simplify this into a single map because we might be mixing project
    // id and number.
    const validTagsByServiceByRegion = {};
    const sites = await api.listSites(project);
    const allVersionsNested = await Promise.all(sites.map((site) => api.listVersions(node_path_1.posix.basename(site.name))));
    const activeVersions = [...(0, functional_1.flattenArray)(allVersionsNested)].filter((version) => {
        return version.status === "CREATED" || version.status === "FINALIZED";
    });
    for (const version of activeVersions) {
        for (const rewrite of ((_a = version === null || version === void 0 ? void 0 : version.config) === null || _a === void 0 ? void 0 : _a.rewrites) || []) {
            if (!("run" in rewrite) || !rewrite.run.tag) {
                continue;
            }
            validTagsByServiceByRegion[rewrite.run.region] =
                validTagsByServiceByRegion[rewrite.run.region] || {};
            validTagsByServiceByRegion[rewrite.run.region][rewrite.run.serviceId] =
                validTagsByServiceByRegion[rewrite.run.region][rewrite.run.serviceId] || new Set();
            validTagsByServiceByRegion[rewrite.run.region][rewrite.run.serviceId].add(rewrite.run.tag);
        }
    }
    // Erase all traffic targets that have an expired tag and no serving percentage
    for (const service of services) {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        const { region, serviceId } = run.gcpIds(service);
        service.spec.traffic = (service.spec.traffic || []).filter((traffic) => {
            var _a, _b;
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
            if ((_b = (_a = validTagsByServiceByRegion[region]) === null || _a === void 0 ? void 0 : _a[serviceId]) === null || _b === void 0 ? void 0 : _b.has(traffic.tag)) {
                return true;
            }
            return false;
        });
    }
}
exports.gcTagsForServices = gcTagsForServices;
// The number of tags after which we start applying GC pressure.
let garbageCollectionThreshold = 500;
/**
 * Sets the garbage collection threshold for testing.
 * @param threshold new GC threshold.
 */
function setGarbageCollectionThreshold(threshold) {
    garbageCollectionThreshold = threshold;
}
exports.setGarbageCollectionThreshold = setGarbageCollectionThreshold;
/**
 * Ensures that all the listed run versions have pins.
 */
async function setRewriteTags(rewrites, project, version) {
    // Note: this is sub-optimal in the case where there are multiple rewrites
    // to the same service. Should we deduplicate this?
    const services = await Promise.all(rewrites
        .map((rewrite) => {
        if (!("run" in rewrite)) {
            return null;
        }
        if (rewrite.run.tag !== exports.TODO_TAG_NAME) {
            return null;
        }
        return run.getService(`projects/${project}/locations/${rewrite.run.region}/services/${rewrite.run.serviceId}`);
    })
        // filter does not drop the null annotation
        .filter((s) => s !== null));
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
    const tags = await exports.ensureLatestRevisionTagged(services, `fh-${version}`);
    for (const rewrite of rewrites) {
        if (!("run" in rewrite) || rewrite.run.tag !== exports.TODO_TAG_NAME) {
            continue;
        }
        const tag = tags[rewrite.run.region][rewrite.run.serviceId];
        rewrite.run.tag = tag;
    }
}
exports.setRewriteTags = setRewriteTags;
/**
 * Given an already fetched service, ensures that the latest revision
 * has a tagged traffic target.
 * If the service does not have a tagged target already, the service will be modified
 * to include a new target and the change will be publisehd to prod.
 * Returns a map of region to map of service to latest tag.
 */
async function ensureLatestRevisionTagged(services, defaultTag) {
    var _a;
    // Region -> Service -> Tag
    const tags = {};
    const updateServices = [];
    for (const service of services) {
        const { projectNumber, region, serviceId } = run.gcpIds(service);
        tags[region] = tags[region] || {};
        const latestRevision = (_a = service.status) === null || _a === void 0 ? void 0 : _a.latestReadyRevisionName;
        if (!latestRevision) {
            throw new error_1.FirebaseError(`Assertion failed: service ${service.metadata.name} has no ready revision`);
        }
        const alreadyTagged = service.spec.traffic.find((target) => target.revisionName === latestRevision && target.tag);
        if (alreadyTagged) {
            // Null assertion is safe because the predicate that found alreadyTagged
            // checked for tag.
            tags[region][serviceId] = alreadyTagged.tag;
            continue;
        }
        tags[region][serviceId] = defaultTag;
        service.spec.traffic.push({
            revisionName: latestRevision,
            tag: defaultTag,
        });
        updateServices.push(run.updateService(`projects/${projectNumber}/locations/${region}/services/${serviceId}`, service));
    }
    await Promise.all(updateServices);
    return tags;
}
exports.ensureLatestRevisionTagged = ensureLatestRevisionTagged;

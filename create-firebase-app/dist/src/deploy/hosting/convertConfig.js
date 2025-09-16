"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertConfig = exports.findEndpointForRewrite = void 0;
const error_1 = require("../../error");
const backend = require("../functions/backend");
const utils_1 = require("../../utils");
const proto = require("../../gcp/proto");
const colorette_1 = require("colorette");
const runTags = require("../../hosting/runTags");
const functional_1 = require("../../functional");
const experiments = require("../../experiments");
const logger_1 = require("../../logger");
/**
 * extractPattern contains the logic for extracting exactly one glob/regexp
 * from a Hosting rewrite/redirect/header specification.
 */
function extractPattern(type, source) {
    let glob;
    let regex;
    if ("source" in source) {
        glob = source.source;
    }
    if ("glob" in source) {
        glob = source.glob;
    }
    if ("regex" in source) {
        regex = source.regex;
    }
    if (glob && regex) {
        throw new error_1.FirebaseError(`Cannot specify a ${type} pattern with both a glob and regex.`);
    }
    else if (glob) {
        return { glob };
    }
    else if (regex) {
        return { regex };
    }
    throw new error_1.FirebaseError(`Cannot specify a ${type} with no pattern (either a glob or regex required).`);
}
/**
 * Finds an endpoint suitable for deploy at a site given an id and optional region.
 */
function findEndpointForRewrite(site, targetBackend, id, region) {
    const endpoints = backend.allEndpoints(targetBackend).filter((e) => e.id === id);
    if (endpoints.length === 0) {
        return { matchingEndpoint: undefined, foundMatchingId: false };
    }
    if (endpoints.length === 1) {
        if (region && region !== endpoints[0].region) {
            return { matchingEndpoint: undefined, foundMatchingId: true };
        }
        return { matchingEndpoint: endpoints[0], foundMatchingId: true };
    }
    if (!region) {
        const us = endpoints.find((e) => e.region === "us-central1");
        if (!us) {
            throw new error_1.FirebaseError(`More than one backend found for function name: ${id}. If the function is deployed in multiple regions, you must specify a region.`);
        }
        (0, utils_1.logLabeledBullet)(`hosting[${site}]`, `Function \`${id}\` found in multiple regions, defaulting to \`us-central1\`. ` +
            `To rewrite to a different region, specify a \`region\` for the rewrite in \`firebase.json\`.`);
        return { matchingEndpoint: us, foundMatchingId: true };
    }
    return {
        matchingEndpoint: endpoints.find((e) => e.region === region),
        foundMatchingId: true,
    };
}
exports.findEndpointForRewrite = findEndpointForRewrite;
/**
 * convertConfig takes a hosting config object from firebase.json and transforms it into
 * the valid format for sending to the Firebase Hosting REST API.
 *
 * TODO: this currently lists remote backends (functions) and attemtps to validate them.
 * We currently catch 403 issues and handle them, but it's probably not the best solution
 * to have a required permission in functions when a deploy may "only" be to Hosting.
 */
async function convertConfig(context, functionsPayload, deploy) {
    var _a, _b, _c, _d;
    const config = {};
    // Instead of *always* fetching backends, let's roughly sanity check our
    // rewrites to see if it's necessary.
    const hasBackends = !!((_a = deploy.config.rewrites) === null || _a === void 0 ? void 0 : _a.some((r) => "function" in r || "run" in r));
    // We need to be able to do a rewrite to an existing function that may not be
    // under Firebase's control or a function that we're currently deploying.
    const wantBackend = backend.merge(...Object.values(functionsPayload.functions || {}).map((c) => c.wantBackend));
    let haveBackend = backend.empty();
    if (hasBackends) {
        try {
            haveBackend = await backend.existingBackend(context);
        }
        catch (err) {
            if (err instanceof error_1.FirebaseError) {
                if (err.status === 403) {
                    // If the callee doesn't have permission to list backends, we just won't
                    // be able to validate them. This is fine.
                    logger_1.logger.debug(`Deploying hosting site ${deploy.config.site}, did not have permissions to check for backends: `, err);
                }
            }
            else {
                throw err;
            }
        }
    }
    config.rewrites = (_b = deploy.config.rewrites) === null || _b === void 0 ? void 0 : _b.map((rewrite) => {
        var _a;
        const target = extractPattern("rewrite", rewrite);
        if ("destination" in rewrite) {
            return Object.assign(Object.assign({}, target), { path: rewrite.destination });
        }
        if ("function" in rewrite) {
            if (typeof rewrite.function === "string") {
                throw new error_1.FirebaseError("Expected firebase config to be normalized, but got legacy functions format");
            }
            const id = rewrite.function.functionId;
            const region = rewrite.function.region;
            const deployingEndpointSearch = findEndpointForRewrite(deploy.config.site, wantBackend, id, region);
            const existingEndpointSearch = !deployingEndpointSearch.foundMatchingId && !deployingEndpointSearch.matchingEndpoint
                ? findEndpointForRewrite(deploy.config.site, haveBackend, id, region)
                : undefined;
            const endpoint = deployingEndpointSearch.matchingEndpoint
                ? deployingEndpointSearch.matchingEndpoint
                : existingEndpointSearch === null || existingEndpointSearch === void 0 ? void 0 : existingEndpointSearch.matchingEndpoint;
            if (!endpoint) {
                // If we find a function matching the function ID we are looking for in either
                // existing or currently-deploying backends, we consider it a firebase function.
                // In this case, we throw an error if the rewrite doesn't point to a valid region.
                if (deployingEndpointSearch.foundMatchingId || (existingEndpointSearch === null || existingEndpointSearch === void 0 ? void 0 : existingEndpointSearch.foundMatchingId)) {
                    throw new error_1.FirebaseError(`Unable to find a valid endpoint for function. Functions matching the rewrite
  are present but in the wrong region.`);
                }
                // This could possibly succeed if there has been a function written
                // outside firebase tooling. But it will break in v2. We might need to
                // revisit this.
                (0, utils_1.logLabeledWarning)(`hosting[${deploy.config.site}]`, `Unable to find a valid endpoint for function \`${id}\`, but still including it in the config`);
                const apiRewrite = Object.assign(Object.assign({}, target), { function: id });
                if (region) {
                    apiRewrite.functionRegion = region;
                }
                return apiRewrite;
            }
            if (endpoint.platform === "gcfv1") {
                if (!backend.isHttpsTriggered(endpoint) && !backend.isCallableTriggered(endpoint)) {
                    throw new error_1.FirebaseError(`Function ${endpoint.id} is a 1st gen function and therefore must be an https function type`);
                }
                if (rewrite.function.pinTag) {
                    throw new error_1.FirebaseError(`Function ${endpoint.id} is a 1st gen function and therefore does not support the ${(0, colorette_1.bold)("pinTag")} option`);
                }
                return Object.assign(Object.assign({}, target), { function: endpoint.id, functionRegion: endpoint.region });
            }
            // V2 functions are actually deployed as run rewrites. This lets us target
            // the service without a cloudfunctions.net URL and allows us to set a
            // target tag.
            const apiRewrite = Object.assign(Object.assign({}, target), { run: {
                    serviceId: (_a = endpoint.runServiceId) !== null && _a !== void 0 ? _a : endpoint.id,
                    region: endpoint.region,
                } });
            if (rewrite.function.pinTag) {
                // b/319616292. Functions currently set min instances at the revision
                // level and Run will maintain all those min instances for each revision
                // whenever that revision is accessible (e.g. via a traffic tag). This
                // can lead to customers paying lots of money with zero benefit. Until
                // Run makes min instances dynamic, we must not allow both features to
                // be used at the same time.
                if (endpoint.minInstances) {
                    throw new error_1.FirebaseError(`Function ${endpoint.id} has minInstances set and is in a rewrite ` +
                        "pinTags=true. These features are not currently compatible with each " +
                        "other.");
                }
                experiments.assertEnabled("pintags", "pin a function version");
                apiRewrite.run.tag = runTags.TODO_TAG_NAME;
            }
            return apiRewrite;
        }
        if ("dynamicLinks" in rewrite) {
            if (!rewrite.dynamicLinks) {
                throw new error_1.FirebaseError("Can only set dynamicLinks to true in a rewrite");
            }
            return Object.assign(Object.assign({}, target), { dynamicLinks: true });
        }
        if ("run" in rewrite) {
            const apiRewrite = Object.assign(Object.assign({}, target), { run: {
                    serviceId: rewrite.run.serviceId,
                    region: rewrite.run.region || "us-central1",
                } });
            if (rewrite.run.pinTag) {
                experiments.assertEnabled("pintags", "pin to a run service revision");
                apiRewrite.run.tag = runTags.TODO_TAG_NAME;
            }
            return apiRewrite;
        }
        // This line makes sure this function breaks if there is ever added a new
        // kind of rewrite and we haven't yet handled it.
        try {
            (0, functional_1.assertExhaustive)(rewrite);
        }
        catch (e) {
            throw new error_1.FirebaseError("Invalid hosting rewrite config in firebase.json. " +
                "A rewrite config must specify 'destination', 'function', 'dynamicLinks', or 'run'");
        }
    });
    if (config.rewrites) {
        const versionId = (0, utils_1.last)(deploy.version.split("/"));
        await runTags.setRewriteTags(config.rewrites, context.projectId, versionId);
    }
    config.redirects = (_c = deploy.config.redirects) === null || _c === void 0 ? void 0 : _c.map((redirect) => {
        const apiRedirect = Object.assign(Object.assign({}, extractPattern("redirect", redirect)), { location: redirect.destination });
        if (redirect.type) {
            apiRedirect.statusCode = redirect.type;
        }
        return apiRedirect;
    });
    config.headers = (_d = deploy.config.headers) === null || _d === void 0 ? void 0 : _d.map((header) => {
        const headers = {};
        for (const { key, value } of header.headers || []) {
            headers[key] = value;
        }
        return Object.assign(Object.assign({}, extractPattern("header", header)), { headers });
    });
    proto.copyIfPresent(config, deploy.config, "cleanUrls", "appAssociation", "i18n");
    proto.convertIfPresent(config, deploy.config, "trailingSlashBehavior", "trailingSlash", (b) => b ? "ADD" : "REMOVE");
    proto.pruneUndefiends(config);
    return config;
}
exports.convertConfig = convertConfig;

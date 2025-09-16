"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDeploymentDomain = exports.getAllSiteDomains = exports.getSiteDomains = exports.cleanAuthState = exports.getCleanDomains = exports.removeAuthDomain = exports.addAuthDomains = exports.deleteSite = exports.updateSite = exports.createSite = exports.getSite = exports.listDemoSites = exports.listSites = exports.createRelease = exports.cloneVersion = exports.listVersions = exports.updateVersion = exports.createVersion = exports.deleteChannel = exports.updateChannelTtl = exports.createChannel = exports.listChannels = exports.getChannel = exports.normalizeName = exports.SiteType = void 0;
const error_1 = require("../error");
const api_1 = require("../api");
const apiv2_1 = require("../apiv2");
const operationPoller = require("../operation-poller");
const expireUtils_1 = require("../hosting/expireUtils");
const auth_1 = require("../gcp/auth");
const proto = require("../gcp/proto");
const utils_1 = require("../utils");
const constants_1 = require("../emulator/constants");
const ONE_WEEK_MS = 604800000; // 7 * 24 * 60 * 60 * 1000
var ReleaseType;
(function (ReleaseType) {
    // An unspecified type. Indicates that a version was released.
    // This is the default value when no other `type` is explicitly
    // specified.
    ReleaseType["TYPE_UNSPECIFIED"] = "TYPE_UNSPECIFIED";
    // A version was uploaded to Firebase Hosting and released.
    ReleaseType["DEPLOY"] = "DEPLOY";
    // The release points back to a previously deployed version.
    ReleaseType["ROLLBACK"] = "ROLLBACK";
    // The release prevents the site from serving content. Firebase Hosting acts
    // as if the site never existed.
    ReleaseType["SITE_DISABLE"] = "SITE_DISABLE";
})(ReleaseType || (ReleaseType = {}));
// The possible types of a site.
var SiteType;
(function (SiteType) {
    // Unknown state, likely the result of an error on the backend.
    SiteType["TYPE_UNSPECIFIED"] = "TYPE_UNSPECIFIED";
    // The default Hosting site that is provisioned when a Firebase project is
    // created.
    SiteType["DEFAULT_SITE"] = "DEFAULT_SITE";
    // A Hosting site that the user created.
    SiteType["USER_SITE"] = "USER_SITE";
})(SiteType = exports.SiteType || (exports.SiteType = {}));
/**
 * normalizeName normalizes a name given to it. Most useful for normalizing
 * user provided names. This removes any `/`, ':', '_', or '#' characters and
 * replaces them with dashes (`-`).
 * @param s the name to normalize.
 * @return the normalized name.
 */
function normalizeName(s) {
    // Using a regex replaces *all* specified characters at once.
    return s.replace(/[/:_#]/g, "-");
}
exports.normalizeName = normalizeName;
const apiClient = new apiv2_1.Client({
    urlPrefix: (0, api_1.hostingApiOrigin)(),
    apiVersion: "v1beta1",
    auth: true,
});
/**
 * getChannel retrieves information about a channel.
 * @param project the project ID or number (can be provided `-`),
 * @param site the site for the channel.
 * @param channelId the specific channel ID.
 * @return the channel, or null if the channel is not found.
 */
async function getChannel(project = "-", site, channelId) {
    try {
        const res = await apiClient.get(`/projects/${project}/sites/${site}/channels/${channelId}`);
        return res.body;
    }
    catch (e) {
        if (e instanceof error_1.FirebaseError && e.status === 404) {
            return null;
        }
        throw e;
    }
}
exports.getChannel = getChannel;
/**
 * listChannels retrieves information about a channel.
 * @param project the project ID or number (can be provided `-`),
 * @param site the site for the channel.
 */
async function listChannels(project = "-", site) {
    var _a;
    const channels = [];
    let nextPageToken = "";
    for (;;) {
        try {
            const res = await apiClient.get(`/projects/${project}/sites/${site}/channels`, { queryParams: { pageToken: nextPageToken, pageSize: 10 } });
            channels.push(...((_a = res.body.channels) !== null && _a !== void 0 ? _a : []));
            nextPageToken = res.body.nextPageToken || "";
            if (!nextPageToken) {
                return channels;
            }
        }
        catch (e) {
            if (e instanceof error_1.FirebaseError && e.status === 404) {
                throw new error_1.FirebaseError(`could not find channels for site "${site}"`, {
                    original: e,
                });
            }
            throw e;
        }
    }
}
exports.listChannels = listChannels;
/**
 * Creates a Channel.
 * @param project the project ID or number (can be provided `-`),
 * @param site the site for the channel.
 * @param channelId the specific channel ID.
 * @param ttlMillis the duration from now to set the expireTime.
 */
async function createChannel(project = "-", site, channelId, ttlMillis = expireUtils_1.DEFAULT_DURATION) {
    const res = await apiClient.post(`/projects/${project}/sites/${site}/channels?channelId=${channelId}`, { ttl: `${ttlMillis / 1000}s` });
    return res.body;
}
exports.createChannel = createChannel;
/**
 * Updates a channel's TTL.
 * @param project the project ID or number (can be provided `-`),
 * @param site the site for the channel.
 * @param channelId the specific channel ID.
 * @param ttlMillis the duration from now to set the expireTime.
 */
async function updateChannelTtl(project = "-", site, channelId, ttlMillis = ONE_WEEK_MS) {
    const res = await apiClient.patch(`/projects/${project}/sites/${site}/channels/${channelId}`, { ttl: `${ttlMillis / 1000}s` }, { queryParams: { updateMask: "ttl" } });
    return res.body;
}
exports.updateChannelTtl = updateChannelTtl;
/**
 * Deletes a channel.
 * @param project the project ID or number (can be provided `-`),
 * @param site the site for the channel.
 * @param channelId the specific channel ID.
 */
async function deleteChannel(project = "-", site, channelId) {
    await apiClient.delete(`/projects/${project}/sites/${site}/channels/${channelId}`);
}
exports.deleteChannel = deleteChannel;
/**
 * Creates a version
 */
async function createVersion(siteId, version) {
    const res = await apiClient.post(`projects/-/sites/${siteId}/versions`, version);
    return res.body.name;
}
exports.createVersion = createVersion;
/**
 * Updates a version.
 */
async function updateVersion(site, versionId, version) {
    const res = await apiClient.patch(`projects/-/sites/${site}/versions/${versionId}`, version, {
        queryParams: {
            // N.B. It's not clear why we need "config". If the Hosting server acted
            // like a normal OP service, we could update config.foo and config.bar
            // in a PATCH command even if config was the empty object already. But
            // not setting config in createVersion and then setting config subfields
            // in updateVersion is failing with
            // "HTTP Error: 40 Unknown path in `updateMask`: `config.rewrites`"
            updateMask: proto.fieldMasks(version, "labels", "config").join(","),
        },
    });
    return res.body;
}
exports.updateVersion = updateVersion;
/**
 * Get a list of all versions for a site, automatically handling pagination.
 */
async function listVersions(site) {
    var _a;
    let pageToken = undefined;
    const versions = [];
    do {
        const queryParams = {};
        if (pageToken) {
            queryParams.pageToken = pageToken;
        }
        const res = await apiClient.get(`projects/-/sites/${site}/versions`, {
            queryParams,
        });
        versions.push(...((_a = res.body.versions) !== null && _a !== void 0 ? _a : []));
        pageToken = res.body.nextPageToken;
    } while (pageToken);
    return versions;
}
exports.listVersions = listVersions;
/**
 * Create a version a clone.
 * @param site the site for the version.
 * @param versionName the specific version ID.
 * @param finalize whether or not to immediately finalize the version.
 */
async function cloneVersion(site, versionName, finalize = false) {
    const res = await apiClient.post(`/projects/-/sites/${site}/versions:clone`, {
        sourceVersion: versionName,
        finalize,
    });
    const { name: operationName } = res.body;
    const pollRes = await operationPoller.pollOperation({
        apiOrigin: (0, api_1.hostingApiOrigin)(),
        apiVersion: "v1beta1",
        operationResourceName: operationName,
        masterTimeout: 600000,
    });
    return pollRes;
}
exports.cloneVersion = cloneVersion;
/**
 * Create a release on a channel.
 * @param site the site for the version.
 * @param channel the channel for the release.
 * @param version the specific version ID.
 */
async function createRelease(site, channel, version, partialRelease) {
    const res = await apiClient.post(`/projects/-/sites/${site}/channels/${channel}/releases`, partialRelease, { queryParams: { versionName: version } });
    return res.body;
}
exports.createRelease = createRelease;
/**
 * List the Hosting sites for a given project.
 * @param project project name or number.
 * @return list of Sites.
 */
async function listSites(project) {
    var _a;
    const sites = [];
    let nextPageToken = "";
    for (;;) {
        try {
            const res = await apiClient.get(`/projects/${project}/sites`, { queryParams: { pageToken: nextPageToken, pageSize: 10 } });
            sites.push(...((_a = res.body.sites) !== null && _a !== void 0 ? _a : []));
            nextPageToken = res.body.nextPageToken || "";
            if (!nextPageToken) {
                return sites;
            }
        }
        catch (e) {
            if (e instanceof error_1.FirebaseError && e.status === 404) {
                throw new error_1.FirebaseError(`could not find sites for project "${project}"`, {
                    original: e,
                });
            }
            throw e;
        }
    }
}
exports.listSites = listSites;
/**
 * Get fake sites object for demo projects running with emulator
 */
function listDemoSites(projectId) {
    return [
        {
            name: `projects/${projectId}/sites/${projectId}`,
            defaultUrl: `https://${projectId}.firebaseapp.com`,
            appId: "fake-app-id",
            labels: {},
        },
    ];
}
exports.listDemoSites = listDemoSites;
/**
 * Get a Hosting site.
 * @param project project name or number.
 * @param site site name.
 * @return site information.
 */
async function getSite(project, site) {
    try {
        const res = await apiClient.get(`/projects/${project}/sites/${site}`);
        return res.body;
    }
    catch (e) {
        if (e instanceof error_1.FirebaseError && e.status === 404) {
            throw new error_1.FirebaseError(`could not find site "${site}" for project "${project}"`, {
                original: e,
                status: e.status,
            });
        }
        throw e;
    }
}
exports.getSite = getSite;
/**
 * Create a Hosting site.
 * @param project project name or number.
 * @param site the site name to create.
 * @param appId the Firebase Web App ID (https://firebase.google.com/docs/projects/learn-more#config-files-objects)
 * @return site information.
 */
async function createSite(project, site, appId = "", validateOnly = false) {
    const queryParams = { siteId: site };
    if (validateOnly) {
        queryParams.validateOnly = "true";
    }
    const res = await apiClient.post(`/projects/${project}/sites`, { appId: appId }, { queryParams });
    return res.body;
}
exports.createSite = createSite;
/**
 * Update a Hosting site.
 * @param project project name or number.
 * @param site the site to update.
 * @param fields the fields to update.
 * @return site information.
 */
async function updateSite(project, site, fields) {
    const res = await apiClient.patch(`/projects/${project}/sites/${site.name}`, site, {
        queryParams: { updateMask: fields.join(",") },
    });
    return res.body;
}
exports.updateSite = updateSite;
/**
 * Delete a Hosting site.
 * @param project project name or number.
 * @param site the site to update.
 * @return nothing.
 */
async function deleteSite(project, site) {
    await apiClient.delete(`/projects/${project}/sites/${site}`);
}
exports.deleteSite = deleteSite;
/**
 * Adds list of channel domains to Firebase Auth list.
 * @param project the project ID.
 * @param urls the list of urls of the channel.
 */
async function addAuthDomains(project, urls) {
    const domains = await (0, auth_1.getAuthDomains)(project);
    const authDomains = domains || [];
    for (const url of urls) {
        const domain = url.replace("https://", "");
        if (authDomains.includes(domain)) {
            continue;
        }
        authDomains.push(domain);
    }
    return await (0, auth_1.updateAuthDomains)(project, authDomains);
}
exports.addAuthDomains = addAuthDomains;
/**
 * Removes channel domain from Firebase Auth list.
 * @param project the project ID.
 * @param url the url of the channel.
 */
async function removeAuthDomain(project, url) {
    const domains = await (0, auth_1.getAuthDomains)(project);
    if (!domains.length) {
        return domains;
    }
    const targetDomain = url.replace("https://", "");
    const authDomains = domains.filter((domain) => domain !== targetDomain);
    return (0, auth_1.updateAuthDomains)(project, authDomains);
}
exports.removeAuthDomain = removeAuthDomain;
/**
 * Constructs a list of "clean domains"
 * by including all existing auth domains
 * with the exception of domains that belong to
 * expired channels.
 * @param project the project ID.
 * @param site the site for the channel.
 */
async function getCleanDomains(project, site) {
    const channels = await listChannels(project, site);
    // Create a map of channel domain names
    const channelMap = channels
        .map((channel) => channel.url.replace("https://", ""))
        .reduce((acc, current) => {
        acc[current] = true;
        return acc;
    }, {});
    // match any string that starts with ${site}--*
    const siteMatch = new RegExp(`^${site}--`, "i");
    // match any string that ends in firebaseapp.com
    const firebaseAppMatch = new RegExp(/firebaseapp.com$/);
    const domains = await (0, auth_1.getAuthDomains)(project);
    const authDomains = [];
    domains.forEach((domain) => {
        // include domains that end in *.firebaseapp.com because urls belonging
        // to the live channel should always be included
        const endsWithFirebaseApp = firebaseAppMatch.test(domain);
        if (endsWithFirebaseApp) {
            authDomains.push(domain);
            return;
        }
        // exclude site domains that have no channels
        const domainWithNoChannel = siteMatch.test(domain) && !channelMap[domain];
        if (domainWithNoChannel) {
            return;
        }
        // add all other domains (ex: "localhost", etc)
        authDomains.push(domain);
    });
    return authDomains;
}
exports.getCleanDomains = getCleanDomains;
/**
 * Retrieves a list of "clean domains" and
 * updates Firebase Auth Api with aforementioned
 * list.
 * @param project the project ID.
 * @param sites the list of sites for the channel.
 */
async function cleanAuthState(project, sites) {
    const siteDomainMap = new Map();
    for (const site of sites) {
        const authDomains = await getCleanDomains(project, site);
        const updatedDomains = await (0, auth_1.updateAuthDomains)(project, authDomains);
        siteDomainMap.set(site, updatedDomains);
    }
    return siteDomainMap;
}
exports.cleanAuthState = cleanAuthState;
/**
 * Retrieves all site domains
 *
 * @param project project ID
 * @param site site id
 * @return array of domains
 */
async function getSiteDomains(project, site) {
    var _a;
    try {
        const res = await apiClient.get(`/projects/${project}/sites/${site}/domains`);
        return (_a = res.body.domains) !== null && _a !== void 0 ? _a : [];
    }
    catch (e) {
        if (e instanceof error_1.FirebaseError && e.status === 404) {
            throw new error_1.FirebaseError(`could not find site "${site}" for project "${project}"`, {
                original: e,
            });
        }
        throw e;
    }
}
exports.getSiteDomains = getSiteDomains;
/**
 * Join the default domain and the custom domains of a Hosting site
 *
 * @param projectId the project id
 * @param siteId the site id
 * @return array of domains
 */
async function getAllSiteDomains(projectId, siteId) {
    const [hostingDomains, defaultDomain] = await Promise.all([
        getSiteDomains(projectId, siteId),
        getSite(projectId, siteId),
    ]);
    const defaultDomainWithoutHttp = defaultDomain.defaultUrl.replace(/^https?:\/\//, "");
    const allSiteDomains = new Set([
        ...hostingDomains.map(({ domainName }) => domainName),
        defaultDomainWithoutHttp,
        `${siteId}.web.app`,
        `${siteId}.firebaseapp.com`,
    ]);
    return Array.from(allSiteDomains);
}
exports.getAllSiteDomains = getAllSiteDomains;
/**
 * Get the deployment domain.
 * If hostingChannel is provided, get the channel url, otherwise get the
 * default site url.
 */
async function getDeploymentDomain(projectId, siteId, hostingChannel) {
    if (constants_1.Constants.isDemoProject(projectId)) {
        return null;
    }
    if (hostingChannel) {
        const channel = await getChannel(projectId, siteId, hostingChannel);
        return channel && (0, utils_1.getHostnameFromUrl)(channel === null || channel === void 0 ? void 0 : channel.url);
    }
    const site = await getSite(projectId, siteId).catch((e) => {
        // return null if the site doesn't exist
        if (e instanceof error_1.FirebaseError &&
            e.original instanceof error_1.FirebaseError &&
            e.original.status === 404) {
            return null;
        }
        throw e;
    });
    return site && (0, utils_1.getHostnameFromUrl)(site === null || site === void 0 ? void 0 : site.defaultUrl);
}
exports.getDeploymentDomain = getDeploymentDomain;

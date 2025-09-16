"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchWebSetup = exports.constructDefaultWebSetup = exports.getCachedWebSetup = void 0;
const apiv2_1 = require("./apiv2");
const configstore_1 = require("./configstore");
const api_1 = require("./api");
const projectUtils_1 = require("./projectUtils");
const logger_1 = require("./logger");
const constants_1 = require("./emulator/constants");
const apiClient = new apiv2_1.Client({ urlPrefix: (0, api_1.firebaseApiOrigin)(), auth: true, apiVersion: "v1beta1" });
const hostingApiClient = new apiv2_1.Client({
    urlPrefix: (0, api_1.hostingApiOrigin)(),
    auth: true,
    apiVersion: "v1beta1",
});
const CONFIGSTORE_KEY = "webconfig";
function setCachedWebSetup(projectId, config) {
    const allConfigs = configstore_1.configstore.get(CONFIGSTORE_KEY) || {};
    allConfigs[projectId] = config;
    configstore_1.configstore.set(CONFIGSTORE_KEY, allConfigs);
}
/**
 * Get the last known WebConfig from the cache.
 * @param options CLI options.
 * @return web app configuration, or undefined.
 */
function getCachedWebSetup(options) {
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const allConfigs = configstore_1.configstore.get(CONFIGSTORE_KEY) || {};
    return allConfigs[projectId];
}
exports.getCachedWebSetup = getCachedWebSetup;
/**
 * Recursively list all hosting sites for a given project.
 */
async function listAllSites(projectId, nextPageToken) {
    const queryParams = nextPageToken ? { pageToken: nextPageToken } : {};
    const res = await hostingApiClient.get(`/projects/${projectId}/sites`, {
        queryParams,
    });
    const sites = res.body.sites;
    if (res.body.nextPageToken) {
        const remainder = await listAllSites(projectId, res.body.nextPageToken);
        return [...sites, ...remainder];
    }
    return sites;
}
/**
 * Construct a fake configuration based on the project ID.
 */
function constructDefaultWebSetup(projectId) {
    return {
        projectId,
        databaseURL: `https://${projectId}.firebaseio.com`,
        storageBucket: `${projectId}.appspot.com`,
        apiKey: "fake-api-key",
        authDomain: `${projectId}.firebaseapp.com`,
    };
}
exports.constructDefaultWebSetup = constructDefaultWebSetup;
/**
 * TODO: deprecate this function in favor of `getAppConfig()` in `/src/management/apps.ts`
 * @param options CLI options.
 * @return web app configuration.
 */
async function fetchWebSetup(options) {
    const projectId = (0, projectUtils_1.needProjectId)(options);
    // When using the emulators with a fake project ID, use a fake web config
    if (constants_1.Constants.isDemoProject(projectId)) {
        return constructDefaultWebSetup(projectId);
    }
    // Try to determine the appId from the default Hosting site, if it is linked.
    let hostingAppId = undefined;
    try {
        const sites = await listAllSites(projectId);
        const defaultSite = sites.find((s) => s.type === "DEFAULT_SITE");
        if (defaultSite && defaultSite.appId) {
            hostingAppId = defaultSite.appId;
        }
    }
    catch (e) {
        logger_1.logger.debug("Failed to list hosting sites");
        logger_1.logger.debug(e);
    }
    // Get the web app config for the appId, or use the '-' special value if the appId is not known
    const appId = hostingAppId || "-";
    const res = await apiClient.get(`/projects/${projectId}/webApps/${appId}/config`);
    const config = res.body;
    if (!config.appId && hostingAppId) {
        config.appId = hostingAppId;
    }
    setCachedWebSetup(config.projectId, config);
    return config;
}
exports.fetchWebSetup = fetchWebSetup;

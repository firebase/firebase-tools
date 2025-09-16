"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testRuleset = exports.updateOrCreateRelease = exports.updateRelease = exports.createRelease = exports.createRuleset = exports.deleteRuleset = exports.getRulesetId = exports.listAllRulesets = exports.listRulesets = exports.getRulesetContent = exports.listAllReleases = exports.listReleases = exports.getLatestRulesetName = void 0;
const api_1 = require("../api");
const apiv2_1 = require("../apiv2");
const logger_1 = require("../logger");
const utils = __importStar(require("../utils"));
const API_VERSION = "v1";
const apiClient = new apiv2_1.Client({ urlPrefix: (0, api_1.rulesOrigin)(), apiVersion: API_VERSION });
function _handleErrorResponse(response) {
    if (response.body && response.body.error) {
        return utils.reject(response.body.error, { code: 2 });
    }
    logger_1.logger.debug("[rules] error:", response.status, response.body);
    return utils.reject("Unexpected error encountered with rules.", {
        code: 2,
    });
}
/**
 * Gets the latest ruleset name on the project.
 * @param projectId Project from which you want to get the ruleset.
 * @param service Service for the ruleset (ex: cloud.firestore or firebase.storage).
 * @return Name of the latest ruleset.
 */
async function getLatestRulesetName(projectId, service) {
    const releases = await listAllReleases(projectId);
    const prefix = `projects/${projectId}/releases/${service}`;
    const release = releases.find((r) => r.name.startsWith(prefix));
    if (!release) {
        return null;
    }
    return release.rulesetName;
}
exports.getLatestRulesetName = getLatestRulesetName;
const MAX_RELEASES_PAGE_SIZE = 10;
/**
 * Lists the releases for the given project.
 */
async function listReleases(projectId, pageToken = "") {
    const response = await apiClient.get(`/projects/${projectId}/releases`, {
        queryParams: {
            pageSize: MAX_RELEASES_PAGE_SIZE,
            pageToken,
        },
    });
    if (response.status === 200) {
        return response.body;
    }
    return _handleErrorResponse(response);
}
exports.listReleases = listReleases;
/**
 * Lists all the releases for the given project, in reverse chronological order.
 *
 * May require many network requests.
 */
async function listAllReleases(projectId) {
    let pageToken;
    let releases = [];
    do {
        const response = await listReleases(projectId, pageToken);
        if (response.releases && response.releases.length > 0) {
            releases = releases.concat(response.releases);
        }
        pageToken = response.nextPageToken;
    } while (pageToken);
    return releases.sort((a, b) => b.createTime.localeCompare(a.createTime));
}
exports.listAllReleases = listAllReleases;
/**
 * Gets the full contents of a ruleset.
 * @param name Name of the ruleset.
 * @return Array of files in the ruleset. Each entry has form { content, name }.
 */
async function getRulesetContent(name) {
    const response = await apiClient.get(`/${name}`, {
        skipLog: { resBody: true },
    });
    if (response.status === 200) {
        const source = response.body.source;
        return source.files;
    }
    return _handleErrorResponse(response);
}
exports.getRulesetContent = getRulesetContent;
const MAX_RULESET_PAGE_SIZE = 100;
/**
 * Lists the rulesets for the given project.
 */
async function listRulesets(projectId, pageToken = "") {
    const response = await apiClient.get(`/projects/${projectId}/rulesets`, {
        queryParams: {
            pageSize: MAX_RULESET_PAGE_SIZE,
            pageToken,
        },
        skipLog: { resBody: true },
    });
    if (response.status === 200) {
        return response.body;
    }
    return _handleErrorResponse(response);
}
exports.listRulesets = listRulesets;
/**
 * Lists all the rulesets for the given project, in reverse chronological order.
 *
 * May require many network requests.
 */
async function listAllRulesets(projectId) {
    let pageToken;
    let rulesets = [];
    do {
        const response = await listRulesets(projectId, pageToken);
        if (response.rulesets) {
            rulesets = rulesets.concat(response.rulesets);
        }
        pageToken = response.nextPageToken;
    } while (pageToken);
    return rulesets.sort((a, b) => b.createTime.localeCompare(a.createTime));
}
exports.listAllRulesets = listAllRulesets;
function getRulesetId(ruleset) {
    // Ruleset names looks like "projects/<project>/rulesets/<ruleset_id>"
    return ruleset.name.split("/").pop();
}
exports.getRulesetId = getRulesetId;
/**
 * Delete the ruleset from the given project. If the ruleset is referenced
 * by a release, the operation will fail.
 */
async function deleteRuleset(projectId, id) {
    const response = await apiClient.delete(`/projects/${projectId}/rulesets/${id}`);
    if (response.status === 200) {
        return;
    }
    return _handleErrorResponse(response);
}
exports.deleteRuleset = deleteRuleset;
/**
 * Creates a new ruleset which can then be associated with a release.
 * @param projectId Project on which you want to create the ruleset.
 * @param {Array} files Array of `{name, content}` for the source files.
 */
async function createRuleset(projectId, files) {
    const payload = { source: { files } };
    const response = await apiClient.post(`/projects/${projectId}/rulesets`, payload, { skipLog: { body: true } });
    if (response.status === 200) {
        logger_1.logger.debug("[rules] created ruleset", response.body.name);
        return response.body.name;
    }
    return _handleErrorResponse(response);
}
exports.createRuleset = createRuleset;
/**
 * Create a new named release with the specified ruleset.
 * @param projectId Project on which you want to create the ruleset.
 * @param rulesetName The unique identifier for the ruleset you want to release.
 * @param releaseName The name (e.g. `firebase.storage`) of the release you want to create.
 */
async function createRelease(projectId, rulesetName, releaseName) {
    const payload = {
        name: `projects/${projectId}/releases/${releaseName}`,
        rulesetName,
    };
    const response = await apiClient.post(`/projects/${projectId}/releases`, payload);
    if (response.status === 200) {
        logger_1.logger.debug("[rules] created release", response.body.name);
        return response.body.name;
    }
    return _handleErrorResponse(response);
}
exports.createRelease = createRelease;
/**
 * Update an existing release with the specified ruleset.
 * @param projectId Project on which you want to create the ruleset.
 * @param rulesetName The unique identifier for the ruleset you want to release.
 * @param releaseName The name (e.g. `firebase.storage`) of the release you want to update.
 */
async function updateRelease(projectId, rulesetName, releaseName) {
    const payload = {
        release: {
            name: `projects/${projectId}/releases/${releaseName}`,
            rulesetName,
        },
    };
    const response = await apiClient.patch(`/projects/${projectId}/releases/${releaseName}`, payload);
    if (response.status === 200) {
        logger_1.logger.debug("[rules] updated release", response.body.name);
        return response.body.name;
    }
    return _handleErrorResponse(response);
}
exports.updateRelease = updateRelease;
async function updateOrCreateRelease(projectId, rulesetName, releaseName) {
    logger_1.logger.debug("[rules] releasing", releaseName, "with ruleset", rulesetName);
    return updateRelease(projectId, rulesetName, releaseName).catch(() => {
        logger_1.logger.debug("[rules] ruleset update failed, attempting to create instead");
        return createRelease(projectId, rulesetName, releaseName);
    });
}
exports.updateOrCreateRelease = updateOrCreateRelease;
function testRuleset(projectId, files) {
    return apiClient.post(`/projects/${encodeURIComponent(projectId)}:test`, { source: { files } }, { skipLog: { body: true } });
}
exports.testRuleset = testRuleset;
//# sourceMappingURL=rules.js.map
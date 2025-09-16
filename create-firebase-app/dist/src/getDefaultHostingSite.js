"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultHostingSite = exports.errNoDefaultSite = void 0;
const error_1 = require("./error");
const api_1 = require("./hosting/api");
const logger_1 = require("./logger");
const projects_1 = require("./management/projects");
const projectUtils_1 = require("./projectUtils");
const utils_1 = require("./utils");
exports.errNoDefaultSite = new error_1.FirebaseError("Could not determine the default site for the project.");
/**
 * Tries to determine the default hosting site for a project, else falls back to projectId.
 * @param options The command-line options object
 * @return The hosting site ID
 */
async function getDefaultHostingSite(options) {
    var _a;
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const project = await (0, projects_1.getFirebaseProject)(projectId);
    let site = (_a = project.resources) === null || _a === void 0 ? void 0 : _a.hostingSite;
    if (!site) {
        logger_1.logger.debug(`the default site does not exist on the Firebase project; asking Hosting.`);
        const sites = await (0, api_1.listSites)(projectId);
        for (const s of sites) {
            if (s.type === api_1.SiteType.DEFAULT_SITE) {
                site = (0, utils_1.last)(s.name.split("/"));
                break;
            }
        }
        if (!site) {
            throw exports.errNoDefaultSite;
        }
        return site;
    }
    return site;
}
exports.getDefaultHostingSite = getDefaultHostingSite;

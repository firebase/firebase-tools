"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishTemplate = exports.deployTemplate = exports.validateInputRemoteConfigTemplate = exports.getEtag = void 0;
const api_1 = require("../../api");
const apiv2_1 = require("../../apiv2");
const error_1 = require("../../error");
const TIMEOUT = 30000;
const client = new apiv2_1.Client({ urlPrefix: (0, api_1.remoteConfigApiOrigin)(), apiVersion: "v1" });
/**
 * Gets Etag for Remote Config Project Template
 * @param projectNumber Input is the Firebase Project's project number
 * @param versionNumber Firebase Remote Config Template version number
 * @return {Promise<string>} Returns a Promise of the Remote Config Template Etag string
 */
async function getEtag(projectNumber, versionNumber) {
    const reqPath = `/projects/${projectNumber}/remoteConfig`;
    const queryParams = {};
    if (versionNumber) {
        queryParams.versionNumber = versionNumber;
    }
    const response = await client.request({
        method: "GET",
        path: reqPath,
        queryParams,
        headers: { "Accept-Encoding": "gzip" },
        timeout: TIMEOUT,
    });
    return response.response.headers.get("etag") || "";
}
exports.getEtag = getEtag;
/**
 * Validates Remote Config Template before deploying project template
 * @param template The Remote Config template to be deployed
 * @return Returns a Promise of the valid Remote Config template
 */
function validateInputRemoteConfigTemplate(template) {
    const templateCopy = JSON.parse(JSON.stringify(template));
    if (!templateCopy || templateCopy === "null" || templateCopy === "undefined") {
        throw new error_1.FirebaseError(`Invalid Remote Config template: ${JSON.stringify(templateCopy)}`);
    }
    if (typeof templateCopy.etag !== "string" || templateCopy.etag === "") {
        throw new error_1.FirebaseError("ETag must be a non-empty string");
    }
    if (templateCopy.conditions && !Array.isArray(templateCopy.conditions)) {
        throw new error_1.FirebaseError("Remote Config conditions must be an array");
    }
    return templateCopy;
}
exports.validateInputRemoteConfigTemplate = validateInputRemoteConfigTemplate;
/**
 * Deploys a Remote Config template information based on the Firebase Project Id
 * If force option is passed, etag value will be set to *. Otherwise, the etag will be created
 * @param projectNumber Input is the Project number string
 * @param template Remote Config template to deploy
 * @param etag Remote Config Template's etag value
 * @param options Optional object when publishing a Remote Config template. If the
 * force {boolean} is `true` the Remote Config template is forced to update and circumvent the Etag
 * @return Returns a Promise of a Remote Config template
 */
async function deployTemplate(projectNumber, template, etag, options) {
    const reqPath = `/projects/${projectNumber}/remoteConfig`;
    if (options === null || options === void 0 ? void 0 : options.force) {
        etag = "*";
    }
    const response = await client.request({
        method: "PUT",
        path: reqPath,
        headers: { "If-Match": etag },
        body: {
            conditions: template.conditions,
            parameters: template.parameters,
            parameterGroups: template.parameterGroups,
        },
        timeout: TIMEOUT,
    });
    return response.body;
}
exports.deployTemplate = deployTemplate;
/**
 * Publishes a valid Remote Config template based on the Firebase Project Id using the deployTemplate function
 * @param projectNumber Input is the Project number of the Firebase Project
 * @param template The Remote Config template to be published
 * @param etag Remote Config Template's etag value
 * @param options Force boolean option
 * @return Returns a Promise that fulfills with the published Remote Config template
 */
function publishTemplate(projectNumber, template, etag, options) {
    const temporaryTemplate = {
        conditions: template.conditions,
        parameters: template.parameters,
        parameterGroups: template.parameterGroups,
        etag: etag,
    };
    let validTemplate = temporaryTemplate;
    validTemplate = validateInputRemoteConfigTemplate(template);
    return deployTemplate(projectNumber, validTemplate, etag, options);
}
exports.publishTemplate = publishTemplate;

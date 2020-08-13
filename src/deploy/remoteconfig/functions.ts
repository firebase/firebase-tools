import { FirebaseError } from "../../error";
import { RemoteConfigTemplate } from "../../remoteconfig/interfaces";

import api = require("../../api");
import logger = require("../../logger");

const TIMEOUT = 30000;

/**
 * Gets Etag for Remote Config Project Template
 * @param projectNumber Input is the Firebase Project's project number
 * @param versionNumber Firebase Remote Config Template version number
 * @return {Promise<string>} Returns a Promise of the Remote Config Template Etag string
 */
export async function getEtag(projectNumber: string, versionNumber?: string): Promise<string> {
  let request = `/v1/projects/${projectNumber}/remoteConfig`;
  if (versionNumber) {
    request = request + "?versionNumber=" + versionNumber;
  }
  const response = await api.request("GET", request, {
    auth: true,
    origin: api.remoteConfigApiOrigin,
    timeout: TIMEOUT,
    headers: { "Accept-Encoding": "gzip" },
  });
  return response.response.headers.etag;
}

/**
 * Validates Remote Config Template before deploying project template
 * @param template The Remote Config template to be deployed
 * @return {Promise<RemoteConfigTemplate>} Returns a Promise of the valid Remote Config template
 */
export function validateInputRemoteConfigTemplate(
  template: RemoteConfigTemplate
): RemoteConfigTemplate {
  const templateCopy = JSON.parse(JSON.stringify(template));
  if (!templateCopy || templateCopy == "null" || templateCopy == "undefined") {
    throw new Error(`'Invalid Remote Config template: ${JSON.stringify(templateCopy)}'`);
  }
  if (typeof templateCopy.etag !== "string" || templateCopy.etag == "") {
    throw new Error(`"ETag must be a non-empty string."`);
  }
  if (templateCopy.conditions && !Array.isArray(templateCopy.conditions)) {
    throw new Error("Remote Config conditions must be an array");
  }
  return templateCopy;
}

/**
 * Deploys a Remote Config template information based on the Firebase Project Id
 * If force option is passed, etag value will be set to *. Otherwise, the etag will be created
 * @param projectNumber Input is the Project number string
 * @param template Remote Config template to deploy
 * @param etag Remote Config Template's etag value
 * @param options Optional object when publishing a Remote Config template. If the
 * force {boolean} is `true` the Remote Config template is forced to update and circumvent the Etag
 * @return {Promise<RemoteConfigTemplate>} Returns a Promise of a Remote Config template
 */
export async function deployTemplate(
  projectNumber: string,
  template: RemoteConfigTemplate,
  etag: string,
  options?: { force: boolean }
): Promise<RemoteConfigTemplate> {
  try {
    const request = `/v1/projects/${projectNumber}/remoteConfig`;
    let projectEtag = etag;
    if (options && options.force == true) {
      projectEtag = "*";
    }
    const response = await api.request("PUT", request, {
      auth: true,
      origin: api.remoteConfigApiOrigin,
      timeout: TIMEOUT,
      headers: { "If-Match": projectEtag },
      data: {
        conditions: template?.conditions,
        parameters: template?.parameters,
        parameterGroups: template?.parameterGroups,
      },
    });
    return response.body;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to deploy Remote Config template for Firebase project ${projectNumber}. `,
      {
        exit: 2,
        original: err,
      }
    );
  }
}

/**
 * Publishes a valid Remote Config template based on the Firebase Project Id using the deployTemplate function
 * @param projectNumber Input is the Project number of the Firebase Project
 * @param template The Remote Config template to be published
 * @param etag Remote Config Template's etag value
 * @param options Force boolean option
 * @return {Promise<RemoteConfigTemplate>} Returns a Promise that fulfills with the published Remote Config template
 */
export async function publishTemplate(
  projectNumber: string,
  template: RemoteConfigTemplate,
  etag: string,
  options?: { force: boolean }
): Promise<RemoteConfigTemplate> {
  const temporaryTemplate = {
    conditions: template?.conditions,
    parameters: template?.parameters,
    parameterGroups: template?.parameterGroups,
    version: template.version,
    etag: etag,
  };
  let validTemplate: RemoteConfigTemplate = temporaryTemplate;
  validTemplate = validateInputRemoteConfigTemplate(template);
  return await deployTemplate(projectNumber, validTemplate, etag, options);
}

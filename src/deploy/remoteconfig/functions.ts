import { RemoteConfigTemplate } from "../../remoteconfig/interfaces";
import api = require("../../api");
import { FirebaseError } from "../../error";
import logger = require("../../logger");

const rcGet = require("../../remoteconfig/get");

const TIMEOUT = 30000;

export async function createEtag(projectNumber: string): Promise<string> {
  const template = await rcGet.getTemplate(projectNumber);
  const etag = "etag-" + projectNumber + "-" + template?.version?.versionNumber;
  return etag;
}

export function validateInputRemoteConfigTemplate(
  template: RemoteConfigTemplate
): RemoteConfigTemplate {
  const templateCopy = JSON.parse(JSON.stringify(template)); // Deep copy
  if (!templateCopy || templateCopy == "null" || templateCopy == "undefined") {
    throw new Error(
      // "invalid-argument",
      `Invalid Remote Config template: ${JSON.stringify(templateCopy)}`
    );
  }
  if (typeof templateCopy.etag !== "string" || templateCopy.etag == "") {
    throw new Error(
      // "invalid-argument",
      "ETag must be a non-empty string."
    );
  }
  if (
    !templateCopy.parameters ||
    templateCopy.parameters == "null" ||
    templateCopy.parameters == "undefined"
  ) {
    throw new Error(
      // "invalid-argument",
      "Remote Config parameters must be a non-null object"
    );
  }
  if (
    !templateCopy.parameterGroups ||
    templateCopy.parameterGroups == "null" ||
    templateCopy.parameterGroups == "undefined"
  ) {
    throw new Error(
      // "invalid-argument",
      "Remote Config parameter groups must be a non-null object"
    );
  }
  if (!Array.isArray(templateCopy.conditions)) {
    throw new Error(
      // "invalid-argument",
      "Remote Config conditions must be an array"
    );
  }
  if (typeof templateCopy.version !== "undefined") {
    // exclude output only properties and keep the only input property: description
    templateCopy.version = { description: templateCopy.version.description };
  }
  return templateCopy;
}

// Function deploys the project information/template specified based on Firebase project ID
export async function deployTemplate(
  projectNumber: string,
  template: RemoteConfigTemplate,
  options?: { force: boolean }
): Promise<RemoteConfigTemplate> {
  try {
    let request = `/v1/projects/${projectNumber}/remoteConfig`;
    let etag = "*";
    console.log(etag);
    if (!options || !options.force == true) {
      etag = await createEtag(projectNumber);
    }
    console.log(etag);
    const response = await api.request("PUT", request, {
      auth: true,
      origin: api.remoteConfigApiOrigin,
      timeout: TIMEOUT,
      headers: { "If-Match": etag },
      data: {
        conditions: template.conditions,
        parameters: template.parameters,
        parameterGroups: template.parameterGroups,
      },
    });
    return response.body;
  } catch (err) {
    console.log(err.message);
    logger.debug(err.message);
    throw new FirebaseError(`Failed to deploy Firebase project ${projectNumber}. `, {
      exit: 2,
      original: err,
    });
  }
}

export async function publishTemplate(
  projectNumber: string,
  template: RemoteConfigTemplate,
  options?: { force: boolean }
): Promise<RemoteConfigTemplate> {
  let temporaryTemplate = {
    conditions: template.conditions,
    parameters: template.parameters,
    parameterGroups: template.parameterGroups,
    version: template.version,
    etag: await createEtag(projectNumber),
  };
  let validTemplate: RemoteConfigTemplate = temporaryTemplate;
  validTemplate = validateInputRemoteConfigTemplate(temporaryTemplate);
  return await deployTemplate(projectNumber, validTemplate, options);
}

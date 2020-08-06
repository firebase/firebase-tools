import api = require("../../api");
import { FirebaseError } from "../../error";
import { createEtag } from "./functions";
import { validateInputRemoteConfigTemplate } from "./functions";
import getProjectNumber = require("../../getProjectNumber");
import logger = require("../../logger");
import { RemoteConfigTemplate } from "../../remoteconfig/interfaces";

const TIMEOUT = 30000;

module.exports = async function(context: any, options: any) {
  if (!context || !context.template) {
    return Promise.resolve();
  }
  const template = context.template;
  const projectNumber = await getProjectNumber(options);
  return publishTemplate(projectNumber, template, options);
};

// Function deploys the project information/template specified based on Firebase project ID
async function deployTemplate(
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
    logger.debug(err.message);
    throw new FirebaseError(`Failed to deploy Firebase project ${projectNumber}. `, {
      exit: 2,
      original: err,
    });
  }
}

async function publishTemplate(
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

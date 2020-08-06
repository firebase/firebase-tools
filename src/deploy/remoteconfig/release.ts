import * as fs from "fs";
import logger = require("../../logger");
import { FirebaseError } from "../../error";
import api = require("../../api");
import { RemoteConfigTemplate } from "../../remoteconfig/interfaces";
const getProjectId = require("../../getProjectId");
import { validateInputRemoteConfigTemplate } from "./functions";
import { createEtag } from "./functions";

const TIMEOUT = 30000;

module.exports = function(context: any, options: any) {
  const filePath = options.config.get("remoteconfig.template");
  const templateString = fs.readFileSync(filePath, "utf8");
  const template = JSON.parse(templateString);
  const projectId = getProjectId(options);
  return publishTemplate(projectId, template, options);
};

// Deploys project information/template based on Firebase project ID
async function deployTemplate(
  projectId: string,
  template: RemoteConfigTemplate,
  options?: { force: boolean }
): Promise<RemoteConfigTemplate> {
  try {
    let request = `/v1/projects/${projectId}/remoteConfig`;
    let etag = "*";
    if (!options || !options.force == true) {
      etag = await createEtag(projectId);
    }
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
    throw new FirebaseError(
      `Failed to deploy Firebase project ${projectId}. ` +
        "Please make sure the project exists and your account has permission to access it.",
      { exit: 2, original: err }
    );
  }
}

async function publishTemplate(
  projectId: string,
  template: RemoteConfigTemplate,
  options?: { force: boolean }
): Promise<RemoteConfigTemplate> {
  let temporaryTemplate = {
    conditions: template.conditions,
    parameters: template.parameters,
    parameterGroups: template.parameterGroups,
    version: template.version,
    etag: await createEtag(projectId),
  };
  let validTemplate: RemoteConfigTemplate = temporaryTemplate;
  if (!options || !options.force == true) {
    validTemplate = validateInputRemoteConfigTemplate(temporaryTemplate);
  } 
  return await deployTemplate(projectId, temporaryTemplate);
}

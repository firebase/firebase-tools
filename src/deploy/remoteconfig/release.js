import * as fs from "fs";
const getProjectId = require("../../getProjectId");
const createEtag = require("./prepare");

module.exports = function(context, options) {
    // if(!context.remoteconfig || !context.remoteconfig.deploy) {
    //     return Promise.resolve();
    // }
    console.log("deploying started")
    var filePath = options.config.get("remoteconfig.template");
    const templateString = fs.readFileSync(filePath, 'utf8');
    const template = JSON.parse(templateString);
    const projectId = getProjectId(options);
    console.log("deploy finished")
    return publishTemplate(projectId, template, options);
}

// Deploys project information/template based on Firebase project ID
async function deployTemplate(
    projectId,
    template,
    options, 
) {
    try {
      console.log(template.conditions)
      
      let request = `/v1/projects/${projectId}/remoteConfig`;

      let etag = "*";
      if (!options || !options.force == true) {
        etag = await createEtag(projectId);
      }
      const response = await api.request("PUT", request, {
        auth: true,
        origin: api.remoteConfigApiOrigin,
        timeout: TIMEOUT,
        headers: {"If-Match": etag},
        data: {
          conditions: template.conditions,
          parameters: template.parameters,
          parameterGroups: template.parameterGroups,
        }
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
   
async function publishTemplate(projectId, template, options) {
    let temporaryTemplate = {
      conditions: template.conditions,
      parameters: template.parameters,
      parameterGroups: template.parameterGroups,
      version: template.version,
      etag: await createEtag(projectId),
    }
    let validTemplate = temporaryTemplate;
    if (!options || !options.force == true) {
      validTemplate = validateInputRemoteConfigTemplate(temporaryTemplate);
    } 
    return await deployTemplate(projectId, temporaryTemplate);
  }
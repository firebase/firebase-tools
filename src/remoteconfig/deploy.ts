import * as api from "../api";
import * as logger from "../logger";
import { FirebaseError } from "../error";
import Validator = require("../validator");
import { RemoteConfigTemplate } from "../remoteconfig/interfaces";

const TIMEOUT = 30000;

 
function validateTemplate(template: RemoteConfigTemplate): Promise<RemoteConfigTemplate> {
    return Promise.resolve(validateInputRemoteConfigTemplate(template));
}
 
export async function publishTemplate(projectId: string, template: RemoteConfigTemplate, options?: { force: boolean }): Promise<RemoteConfigTemplate> {
    //const validTemplate = validateInputRemoteConfigTemplate(template);
    console.log(template);
    return await deployTemplate(projectId, template);
}
 
// Deploys project information/template based on Firebase project ID
export async function deployTemplate(
    projectId: string,
    template: RemoteConfigTemplate,
  ): Promise<RemoteConfigTemplate> {
    console.log(template);
    console.log(template["parameters"]);
    const myData = {
      conditions: {},
      parameters: 
        { enter_number: { defaultValue: { value: '4' } },
          another_number: { defaultValue: { value: '4' } } },
      parameterGroups: {},
      version:   { versionNumber: '3',
      updateTime: '2020-07-17T17:21:59.275Z',
      updateUser: { email: 'jackiechu@google.com' },
      updateOrigin: 'CONSOLE',
      updateType: 'INCREMENTAL_UPDATE' },
    }
    console.log(myData);
    try {
      let request = `/v1/projects/${projectId}/remoteConfig`;
      const response = await api.request("PUT", request, {
        auth: true,
        origin: api.firebaseRemoteConfigApiOrigin,
        timeout: TIMEOUT,
        headers: {"If-Match": "*"},
        data: myData,
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
 
 
export function validateInputRemoteConfigTemplate(template: RemoteConfigTemplate): RemoteConfigTemplate {
   const templateCopy = JSON.parse(JSON.stringify(template)); // Deep copy
   if (!templateCopy || templateCopy == 'null' || templateCopy == 'undefined') {   
     throw new FirebaseError(
       //'invalid-argument',
       `Invalid Remote Config template: ${JSON.stringify(templateCopy)}`);
   }
   if (typeof(templateCopy.etag) !== "string" || templateCopy.etag == "") { 
     throw new FirebaseError(
       //'invalid-argument',
       'ETag must be a non-empty string.');
   }
   if (!templateCopy.parameters || templateCopy.parameters == 'null' || templateCopy.parameters == 'undefined') {
     throw new FirebaseError(
       //'invalid-argument',
       'Remote Config parameters must be a non-null object');
   }
   if (!templateCopy.parameterGroups || templateCopy.parameterGroups == 'null' || templateCopy.parameterGroups == 'undefined') {
     throw new FirebaseError(
       //'invalid-argument',
       'Remote Config parameter groups must be a non-null object');
   }
   if (!Array.isArray(templateCopy.conditions)) {
     throw new FirebaseError(
       //'invalid-argument',
       'Remote Config conditions must be an array');
   }
   if (typeof templateCopy.version !== 'undefined') {
     // exclude output only properties and keep the only input property: description
     templateCopy.version = { description: templateCopy.version.description };
   }
   return templateCopy;
 }
 
 
 


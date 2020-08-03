// import * as api from "../api";
// import * as logger from "../logger";
// import { FirebaseError } from "../error";
// import Validator = require("../validator");
// import { RemoteConfigTemplate, Version } from "../remoteconfig/interfaces";
// import * as rcGet from "../remoteconfig/get";

// const TIMEOUT = 30000;

 
// function validateTemplate(template: RemoteConfigTemplate): Promise<RemoteConfigTemplate> {
//     return Promise.resolve(validateInputRemoteConfigTemplate(template));
// }

// async function createEtag(projectId: string): Promise<string> {
//   //console.log(projectId)
//   const template = await rcGet.getTemplate(projectId)
//   //console.log(template)
//   const etag = "etag-" + projectId + "-" + template?.version?.versionNumber;
//   //console.log(etag)
//   return etag;
// }
 
// export async function publishTemplate(projectId: string, template: RemoteConfigTemplate, options?: { force: boolean }): Promise<RemoteConfigTemplate> {
//   let temporaryTemplate = {
//     conditions: template.conditions,
//     parameters: template.parameters,
//     parameterGroups: template.parameterGroups,
//     version: template.version,
//     etag: await createEtag(projectId),
//   }
//   let validTemplate: RemoteConfigTemplate = temporaryTemplate;
//   if (!options || !options.force == true) {
//     validTemplate = validateInputRemoteConfigTemplate(temporaryTemplate);
//   } 
//   return await deployTemplate(projectId, temporaryTemplate);
// }
 
// // Deploys project information/template based on Firebase project ID
// export async function deployTemplate(
//     projectId: string,
//     template: RemoteConfigTemplate,
//     options?: { force: boolean }, 
//   ): Promise<RemoteConfigTemplate> {
//     try {
//       console.log(template.conditions)
      
//       let request = `/v1/projects/${projectId}/remoteConfig`;

//       let etag = "*";
//       if (!options || !options.force == true) {
//         etag = await createEtag(projectId);
//       }
//       const response = await api.request("PUT", request, {
//         auth: true,
//         origin: api.remoteConfigApiOrigin,
//         timeout: TIMEOUT,
//         headers: {"If-Match": etag},
//         data: {
//           conditions: template.conditions,
//           parameters: template.parameters,
//           parameterGroups: template.parameterGroups,
//         }
//       });
//       return response.body;
//     } catch (err) {
//       logger.debug(err.message);
//       throw new FirebaseError(
//         `Failed to deploy Firebase project ${projectId}. ` +
//           "Please make sure the project exists and your account has permission to access it.",
//         { exit: 2, original: err }
//       );
//     }
//   }
 
 
// export function validateInputRemoteConfigTemplate(template: RemoteConfigTemplate): RemoteConfigTemplate {
//    const templateCopy = JSON.parse(JSON.stringify(template)); // Deep copy
//    if (!templateCopy || templateCopy == 'null' || templateCopy == 'undefined') {   
//      throw new FirebaseError(
//        //'invalid-argument',
//        `Invalid Remote Config template: ${JSON.stringify(templateCopy)}`);
//    }
//    if (typeof(templateCopy.etag) !== "string" || templateCopy.etag == "") { 
//      throw new FirebaseError(
//        //'invalid-argument',
//        'ETag must be a non-empty string.');
//    }
//    if (!templateCopy.parameters || templateCopy.parameters == 'null' || templateCopy.parameters == 'undefined') {
//      throw new FirebaseError(
//        //'invalid-argument',
//        'Remote Config parameters must be a non-null object');
//    }
//    if (!templateCopy.parameterGroups || templateCopy.parameterGroups == 'null' || templateCopy.parameterGroups == 'undefined') {
//      throw new FirebaseError(
//        //'invalid-argument',
//        'Remote Config parameter groups must be a non-null object');
//    }
//    if (!Array.isArray(templateCopy.conditions)) {
//      throw new FirebaseError(
//        //'invalid-argument',
//        'Remote Config conditions must be an array');
//    }
//    if (typeof templateCopy.version !== 'undefined') {
//      // exclude output only properties and keep the only input property: description
//      templateCopy.version = { description: templateCopy.version.description };
//    }
//    return templateCopy;
//  }
 
 


// import * as utils from '../utils/index';
// import * as validator from '../utils/validator';
// import { deepCopy } from '../utils/deep-copy';

// // Remote Config backend constants
// const FIREBASE_REMOTE_CONFIG_V1_API = 'https://firebaseremoteconfig.googleapis.com/v1';
// const FIREBASE_REMOTE_CONFIG_HEADERS = {
//   'X-Firebase-Client': 'fire-admin-node/<XXX_SDK_VERSION_XXX>',
//   // There is a known issue in which the ETag is not properly returned in cases where the request
//   // does not specify a compression type. Currently, it is required to include the header
//   // `Accept-Encoding: gzip` or equivalent in all requests.
//   // https://firebase.google.com/docs/remote-config/use-config-rest#etag_usage_and_forced_updates
//   'Accept-Encoding': 'gzip',
// };

// export enum TagColor {
//   BLUE = "Blue",
//   BROWN = "Brown",
//   CYAN = "Cyan",
//   DEEP_ORANGE = "Red Orange",
//   GREEN = "Green",
//   INDIGO = "Indigo",
//   LIME = "Lime",
//   ORANGE = "Orange",
//   PINK = "Pink",
//   PURPLE = "Purple",
//   TEAL = "Teal",
// }

// /** Interface representing a Remote Config parameter `value` in value options. */
// export interface ExplicitParameterValue {
//   value: string;
// }

// /** Interface representing a Remote Config parameter `useInAppDefault` in value options. */
// export interface InAppDefaultValue {
//   useInAppDefault: boolean;
// }

// export type RemoteConfigParameterValue = ExplicitParameterValue | InAppDefaultValue;

// /** Interface representing a Remote Config parameter. */
// export interface RemoteConfigParameter {
//   defaultValue?: RemoteConfigParameterValue;
//   conditionalValues?: { [key: string]: RemoteConfigParameterValue };
//   description?: string;
// }

// /** Interface representing a Remote Config parameter group. */
// export interface RemoteConfigParameterGroup {
//   description?: string;
//   parameters: { [key: string]: RemoteConfigParameter };
// }

// /** Interface representing a Remote Config condition. */
// export interface RemoteConfigCondition {
//   name: string;
//   expression: string;
//   tagColor?: TagColor;
// }

// /** Interface representing a Remote Config template. */
// export interface RemoteConfigTemplate {
//   conditions: RemoteConfigCondition[];
//   parameters: { [key: string]: RemoteConfigParameter };
//   parameterGroups: { [key: string]: RemoteConfigParameterGroup };
//   readonly etag: string;
//   version?: Version;
// }

// /** Interface representing a Remote Config version. */
// export interface Version {
//   versionNumber?: string; // int64 format
//   updateTime?: string; // in UTC
//   updateOrigin?: ('REMOTE_CONFIG_UPDATE_ORIGIN_UNSPECIFIED' | 'CONSOLE' |
//     'REST_API' | 'ADMIN_SDK_NODE');
//   updateType?: ('REMOTE_CONFIG_UPDATE_TYPE_UNSPECIFIED' |
//     'INCREMENTAL_UPDATE' | 'FORCED_UPDATE' | 'ROLLBACK');
//   updateUser?: RemoteConfigUser;
//   description?: string;
//   rollbackSource?: string;
//   isLegacy?: boolean;
// }

// /** Interface representing a list of Remote Config template versions. */
// export interface ListVersionsResult {
//   versions: Version[];
//   nextPageToken?: string;
// }

// /** Interface representing a Remote Config list version options. */
// export interface ListVersionsOptions {
//   pageSize?: number;
//   pageToken?: string;
//   endVersionNumber?: string | number;
//   startTime?: Date | string;
//   endTime?: Date | string;
// }

// /** Interface representing a Remote Config user. */
// export interface RemoteConfigUser {
//   email: string;
//   name?: string;
//   imageUrl?: string;
// }

// function validateTemplate(template: RemoteConfigTemplate): Promise<RemoteConfigTemplate> {
//     template = this.validateInputRemoteConfigTemplate(template);
//     return this.sendPutRequest(template, template.etag, true)
//       .then((resp) => {
//         // validating a template returns an etag with the suffix -0 means that your update 
//         // was successfully validated. We set the etag back to the original etag of the template
//         // to allow future operations.
//         this.validateEtag(resp.headers['etag']);
//         return this.toRemoteConfigTemplate(resp, template.etag);
//       })
//       .catch((err) => {
//         throw this.toFirebaseError(err);
//       });
//   }

//   function publishTemplate(template: RemoteConfigTemplate, options?: { force: boolean }): Promise<RemoteConfigTemplate> {
//     template = this.validateInputRemoteConfigTemplate(template);
//     let ifMatch: string = template.etag;
//     if (options && options.force == true) {
//       // setting `If-Match: *` forces the Remote Config template to be updated
//       // and circumvent the ETag, and the protection from that it provides.
//       ifMatch = '*';
//     }
//     return this.sendPutRequest(template, ifMatch)
//       .then((resp) => {
//         return this.toRemoteConfigTemplate(resp);
//       })
//       .catch((err) => {
//         throw this.toFirebaseError(err);
//       });
//   }

//   function sendPutRequest(template: RemoteConfigTemplate, etag: string, validateOnly?: boolean): Promise<HttpResponse> {
//     let path = 'remoteConfig';
//     if (validateOnly) {
//       path += '?validate_only=true';
//     }
//     return this.getUrl()
//       .then((url) => {
//         const request: HttpRequestConfig = {
//           method: 'PUT',
//           url: `${url}/${path}`,
//           headers: { ...FIREBASE_REMOTE_CONFIG_HEADERS, 'If-Match': etag },
//           data: {
//             conditions: template.conditions,
//             parameters: template.parameters,
//             parameterGroups: template.parameterGroups,
//             version: template.version,
//           }
//         };
//         return this.httpClient.send(request);
//       });
//   }

//   function getUrl(): Promise<string> {
//     return this.getProjectIdPrefix()
//       .then((projectIdPrefix) => {
//         return `${FIREBASE_REMOTE_CONFIG_V1_API}/${projectIdPrefix}`;
//       });
//   }

//   function getProjectIdPrefix(): Promise<string> {
//     if (this.projectIdPrefix) {
//       return Promise.resolve(this.projectIdPrefix);
//     }

//     return utils.findProjectId(this.app)//replace with  getProjecccctID
//       .then((projectId) => {
//         if (!validator.isNonEmptyString(projectId)) {
//           throw new FirebaseRemoteConfigError(
//             'unknown-error',
//             'Failed to determine project ID. Initialize the SDK with service account credentials, or '
//             + 'set project ID as an app option. Alternatively, set the GOOGLE_CLOUD_PROJECT '
//             + 'environment variable.');
//         }

//         this.projectIdPrefix = `projects/${projectId}`;
//         return this.projectIdPrefix;
//       });
//   }

//   /**
//    * Checks if the given RemoteConfigTemplate object is valid.
//    * The object must have valid parameters, parameter groups, conditions, and an etag.
//    * Removes output only properties from version metadata.
//    *
//    * @param {RemoteConfigTemplate} template A RemoteConfigTemplate object to be validated.
//    * 
//    * @returns {RemoteConfigTemplate} The validated RemoteConfigTemplate object.
//    */
//   function validateInputRemoteConfigTemplate(template: RemoteConfigTemplate): RemoteConfigTemplate {
//     const templateCopy = deepCopy(template);
//     if (!validator.isNonNullObject(templateCopy)) {
//       throw new FirebaseRemoteConfigError(
//         'invalid-argument',
//         `Invalid Remote Config template: ${JSON.stringify(templateCopy)}`);
//     }
//     if (!validator.isNonEmptyString(templateCopy.etag)) {
//       throw new FirebaseRemoteConfigError(
//         'invalid-argument',
//         'ETag must be a non-empty string.');
//     }
//     if (!validator.isNonNullObject(templateCopy.parameters)) {
//       throw new FirebaseRemoteConfigError(
//         'invalid-argument',
//         'Remote Config parameters must be a non-null object');
//     }
//     if (!validator.isNonNullObject(templateCopy.parameterGroups)) {
//       throw new FirebaseRemoteConfigError(
//         'invalid-argument',
//         'Remote Config parameter groups must be a non-null object');
//     }
//     if (!validator.isArray(templateCopy.conditions)) {
//       throw new FirebaseRemoteConfigError(
//         'invalid-argument',
//         'Remote Config conditions must be an array');
//     }
//     if (typeof templateCopy.version !== 'undefined') {
//       // exclude output only properties and keep the only input property: description
//       templateCopy.version = { description: templateCopy.version.description };
//     }
//     return templateCopy;
//   }



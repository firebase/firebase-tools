// import * as api from "../api";
// import * as logger from "../logger";
// import { FirebaseError } from "../error";

// const TIMEOUT = 30000;

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
    
// }

// // function publishTemplate(template: RemoteConfigTemplate, options?: { force: boolean }): Promise<RemoteConfigTemplate> {

// // }

// // // Deploys project information/template based on Firebase project ID
// // export async function deployTemplate(
// //     projectId: string,
// //     versionNumber = null
// //   ): Promise<RemoteConfigTemplate> {
// //     try {
// //       let request = `/v1/projects/${projectId}/remoteConfig`;
// //       const response = await api.request("PUT", request, {
// //         auth: true,
// //         origin: api.firebaseRemoteConfigApiOrigin,
// //         timeout: TIMEOUT,
// //       });
// //       return response.body;
// //     } catch (err) {
// //       logger.debug(err.message);
// //       throw new FirebaseError(
// //         `Failed to get Firebase project ${projectId}. ` +
// //           "Please make sure the project exists and your account has permission to access it.",
// //         { exit: 2, original: err }
// //       );
// //     }
// //   }


//  export function validateInputRemoteConfigTemplate(template: RemoteConfigTemplate): RemoteConfigTemplate {
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



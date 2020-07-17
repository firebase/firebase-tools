import * as api from "../api";
import * as logger from "../logger";
import { FirebaseError } from "../error";

const TIMEOUT = 30000;

export enum TagColor {
  BLUE = "Blue",
  BROWN = "Brown",
  CYAN = "Cyan",
  DEEP_ORANGE = "Red Orange",
  GREEN = "Green",
  INDIGO = "Indigo",
  LIME = "Lime",
  ORANGE = "Orange",
  PINK = "Pink",
  PURPLE = "Purple",
  TEAL = "Teal",
}

/** Interface representing a Remote Config parameter `value` in value options. */
export interface ExplicitParameterValue {
  value: string;
}

/** Interface representing a Remote Config parameter `useInAppDefault` in value options. */
export interface InAppDefaultValue {
  useInAppDefault: boolean;
}

export type RemoteConfigParameterValue = ExplicitParameterValue | InAppDefaultValue;

/** Interface representing a Remote Config condition. */
export interface RemoteConfigCondition {
  name: string;
  expression: string;
  tagColor?: TagColor;
}

/** Interface representing a Remote Config user. */
export interface RemoteConfigUser {
  email: string;
  name?: string;
  imageUrl?: string;
}

/** Interface representing a Remote Config parameter. */
export interface RemoteConfigParameter {
  defaultValue?: RemoteConfigParameterValue;
  conditionalValues?: { [key: string]: RemoteConfigParameterValue };
  description?: string;
}

/** Interface representing a Remote Config parameter group. */
export interface RemoteConfigParameterGroup {
  description?: string;
  parameters: { [key: string]: RemoteConfigParameter };
}

/** Interface representing a Remote Config version. */
export interface Version {
  versionNumber?: string; // int64 format
  updateTime?: string; // in UTC
  updateOrigin?:
    | "REMOTE_CONFIG_UPDATE_ORIGIN_UNSPECIFIED"
    | "CONSOLE"
    | "REST_API"
    | "ADMIN_SDK_NOD";
  updateType?:
    | "REMOTE_CONFIG_UPDATE_TYPE_UNSPECIFIED"
    | "INCREMENTAL_UPDATE"
    | "FORCED_UPDATE"
    | "ROLLBACK";
  updateUser?: RemoteConfigUser;
  description?: string;
  rollbackSource?: string;
  isLegacy?: boolean;
}

// Interface representing Remote Config Template
export interface RemoteConfigTemplate {
  conditions: RemoteConfigCondition[];
  parameters: { [key: string]: RemoteConfigParameter };
  parameterGroups: { [key: string]: RemoteConfigParameterGroup };
  readonly etag: string;
  version?: Version;
}

// Gets project information/template based on Firebase project ID
export async function getTemplate(
  projectId: string,
  versionNumber = null
): Promise<RemoteConfigTemplate> {
  try {
    let request = `/v1/projects/${projectId}/remoteConfig`;
    if (versionNumber) {
      request = request + "?versionNumber=" + versionNumber;
    }
    const response = await api.request("GET", request, {
      auth: true,
      origin: api.firebaseRemoteConfigApiOrigin,
      timeout: TIMEOUT,
    });
    return response.body;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to get Firebase project ${projectId}. ` +
        "Please make sure the project exists and your account has permission to access it.",
      { exit: 2, original: err }
    );
  }
}

import { Client } from "../apiv2";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";

const TIMEOUT = 10000;

const apiClient = new Client({
  urlPrefix: crashlyticsApiOrigin(),
  apiVersion: "v1alpha",
});

enum PLATFORM_PATH {
  ANDROID = "topAndroidDevices",
  IOS = "topAppleDevices",
}

export async function listTopDevices(
  projectId: string,
  appId: string,
  deviceCount: number,
): Promise<string> {
  try {
    const queryParams = new URLSearchParams();
    queryParams.set("page_size", `${deviceCount}`);

    const requestProjectId = parseProjectId(appId);
    if (requestProjectId === undefined) {
      throw new FirebaseError("Unable to get the projectId from the AppId.");
    }

    const platformPath = parsePlatform(appId);

    const response = await apiClient.request<void, string>({
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      path: `/projects/${requestProjectId}/apps/${appId}/reports/${platformPath}`,
      queryParams: queryParams,
      timeout: TIMEOUT,
    });

    return response.body;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to fetch the top devices for the Firebase Project ${projectId}, AppId ${appId}. Error: ${err}.`,
      { original: err },
    );
  }
}

function parseProjectId(appId: string): string | undefined {
  const appIdParts = appId.split(":");
  if (appIdParts.length > 1) {
    return appIdParts[1];
  }
  return undefined;
}

function parsePlatform(appId: string): PLATFORM_PATH {
  const appIdParts = appId.split(":");
  if (appIdParts.length < 3) {
    throw new FirebaseError("Unable to get the platform from the AppId.");
  }

  if (appIdParts[2] === "android") {
    return PLATFORM_PATH.ANDROID;
  } else if (appIdParts[2] === "ios") return PLATFORM_PATH.IOS;
  throw new FirebaseError(`Only android or ios apps are supported.`);
}

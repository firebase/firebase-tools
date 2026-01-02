import { messagingDataApiOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { ListAndroidDeliveryDataResponse } from "./interfaces";

const TIMEOUT = 10000;

const apiClient = new Client({
  urlPrefix: messagingDataApiOrigin(),
  apiVersion: "v1beta1",
});

export async function getAndroidDeliveryData(
  projectId: string,
  androidAppId: string,
  options: {
    pageSize?: number;
    pageToken?: string;
  },
): Promise<ListAndroidDeliveryDataResponse> {
  try {
    // API docs for fetching Android delivery data are here:
    // https://firebase.google.com/docs/reference/fcmdata/rest/v1beta1/projects.androidApps.deliveryData/list#http-request

    const customHeaders = {
      "Content-Type": "application/json",
      "x-goog-user-project": projectId,
    };

    // set up query params
    const params = new URLSearchParams();
    if (options.pageSize) {
      params.set("pageSize", String(options.pageSize));
    }
    if (options.pageToken) {
      params.set("pageToken", options.pageToken);
    }

    logger.debug(`requesting android delivery data for ${projectId}, ${androidAppId}`);

    const res = await apiClient.request<null, ListAndroidDeliveryDataResponse>({
      method: "GET",
      path: `/projects/${projectId}/androidApps/${androidAppId}/deliveryData`,
      queryParams: params,
      headers: customHeaders,
      timeout: TIMEOUT,
    });

    logger.debug(`${res.status}, ${res.response}, ${res.body}`);
    return res.body;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      `Failed to fetch delivery data for project ${projectId} and ${androidAppId}, ${err}.`,
      { original: err },
    );
  }
}

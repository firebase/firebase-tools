import { logger } from "../logger";
import { FirebaseError, getError } from "../error";
import { CRASHLYTICS_API_CLIENT, parseProjectNumber, TIMEOUT } from "./utils";
import { ListEventsResponse } from "./types";
import { EventFilter, filterToUrlSearchParams } from "./filters";

/**
 * List Crashlytics events matching the given filters.
 * @param appId Firebase app_id
 * @param filter An optional EventFilter to selectively filter the sample events.
 * @param pageSize optional, number of events to return
 * @return A ListEventsResponse containing the most recent events matching the filters.
 */
export async function listEvents(
  appId: string,
  filter: EventFilter,
  pageSize = 1,
): Promise<ListEventsResponse> {
  const requestProjectNumber = parseProjectNumber(appId);

  try {
    const queryParams = filterToUrlSearchParams(filter);
    queryParams.set("page_size", `${pageSize}`);

    logger.debug(
      `[crashlytics] listEvents called with appId: ${appId}, filter: ${queryParams.toString()}, pageSize: ${pageSize}`,
    );

    const response = await CRASHLYTICS_API_CLIENT.request<void, ListEventsResponse>({
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      path: `/projects/${requestProjectNumber}/apps/${appId}/events`,
      queryParams: queryParams,
      timeout: TIMEOUT,
    });

    return response.body;
  } catch (err: unknown) {
    throw new FirebaseError(`Failed to list events for app_id ${appId}.`, {
      original: getError(err),
    });
  }
}

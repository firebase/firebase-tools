import { logger } from "../logger";
import { FirebaseError, getError } from "../error";
import { CRASHLYTICS_API_CLIENT, parseProjectNumber, TIMEOUT } from "./utils";
import { BatchGetEventsResponse, ListEventsResponse } from "./types";
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

/**
 * Get multiple events by resource name.
 * Can be used with the `sampleEvent` resource included in topIssues reports.
 * @param appId Firebase app_id
 * @param eventNames the resource names for the desired events.
 * Format: "projects/{project}/apps/{app_id}/events/{event_id}"
 * @return A BatchGetEventsResponse including an array of Event.
 */
export async function batchGetEvents(
  appId: string,
  eventNames: string[],
): Promise<BatchGetEventsResponse> {
  const requestProjectNumber = parseProjectNumber(appId);
  if (eventNames.length > 100) throw new FirebaseError("Too many events in batchGet request");
  logger.debug(
    `[crashlytics] batchGetEvents called with appId: ${appId}, eventNames: ${eventNames.join(", ")}`,
  );
  const queryParams = new URLSearchParams();
  eventNames.forEach((en) => {
    queryParams.append("names", en);
  });

  try {
    const response = await CRASHLYTICS_API_CLIENT.request<void, BatchGetEventsResponse>({
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      path: `/projects/${requestProjectNumber}/apps/${appId}/events:batchGet`,
      queryParams: queryParams,
      timeout: TIMEOUT,
    });

    return response.body;
  } catch (err: unknown) {
    throw new FirebaseError(`Failed to batch get events for app_id ${appId}.`, {
      original: getError(err),
    });
  }
}

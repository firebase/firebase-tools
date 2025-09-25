import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { batchGetEvents, listEvents } from "../../../crashlytics/events";
import {
  BatchGetEventsResponse,
  ErrorType,
  Event,
  ListEventsResponse,
} from "../../../crashlytics/types";
import { ApplicationIdSchema, EventFilterSchema } from "../../../crashlytics/filters";

function pruneThreads(sample: Event): Event {
  if (sample.issue?.errorType === ErrorType.FATAL || sample.issue?.errorType === ErrorType.ANR) {
    // Remove irrelevant threads from the response to reduce token usage
    sample.threads = sample.threads?.filter((t) => t.crashed || t.blamed);
  }
  return sample;
}

export const list_events = tool(
  {
    name: "list_events",
    description: `Lists the most recent events matching the given filters.
      Can be used to fetch sample crashes and exceptions for an issue,
      which will include stack traces and other data useful for debugging.`,
    inputSchema: z.object({
      appId: ApplicationIdSchema,
      filter: EventFilterSchema,
      pageSize: z.number().describe("Number of rows to return").default(1),
    }),
    annotations: {
      title: "List Crashlytics Events",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  async ({ appId, filter, pageSize }) => {
    if (!appId) return mcpError(`Must specify 'appId' parameter.`);
    if (!filter || (!filter.issueId && !filter.issueVariantId))
      return mcpError(`Must specify 'filter.issueId' or 'filter.issueVariantId' parameters.`);

    const response: ListEventsResponse = await listEvents(appId, filter, pageSize);
    response.events = response.events ? response.events.map((e) => pruneThreads(e)) : [];
    return toContent(response);
  },
);

export const batch_get_events = tool(
  {
    name: "batch_get_events",
    description: `Gets specific events by resource name.
      Can be used to fetch sample crashes and exceptions for an issue,
      which will include stack traces and other data useful for debugging.`,
    inputSchema: z.object({
      appId: ApplicationIdSchema,
      names: z
        .array(z.string())
        .describe(
          "An array of the event resource names, as found in the sampleEvent field in reports.",
        ),
    }),
    annotations: {
      title: "Batch Get Crashlytics Events",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  async ({ appId, names }) => {
    if (!appId) return mcpError(`Must specify 'appId' parameter.`);
    if (!names || names.length === 0)
      return mcpError(`Must provide event resource names in name parameter.`);

    const response: BatchGetEventsResponse = await batchGetEvents(appId, names);
    response.events = response.events ? response.events.map((e) => pruneThreads(e)) : [];
    return toContent(response);
  },
);

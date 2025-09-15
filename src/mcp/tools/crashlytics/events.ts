import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { listEvents } from "../../../crashlytics/events";
import { ErrorType, Event, ListEventsResponse } from "../../../crashlytics/types";
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
    if (!filter || !filter.issueId) return mcpError(`Must specify 'issue_id' parameter.`);

    const samples: ListEventsResponse = await listEvents(appId, filter, pageSize);
    samples.events = samples.events.map((e) => pruneThreads(e));
    return toContent(samples);
  },
);

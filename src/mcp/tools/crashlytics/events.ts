import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { dump } from "js-yaml";
import { z } from "zod";
import {
  batchGetEvents,
  EVENT_DUMP_OPTIONS,
  listEvents,
  toText,
} from "../../../crashlytics/events";
import {
  ApplicationIdSchema,
  EventFilterSchema,
  FilterExpressionSchema,
} from "../../../crashlytics/filters";
import { BatchGetEventsResponse, ListEventsResponse } from "../../../crashlytics/types";
import { RESOURCE_CONTENT as forceAppIdGuide } from "../../resources/guides/app_id";
import { tool } from "../../tool";

export const list_events = tool(
  "crashlytics",
  {
    name: "list_events",
    description: `Use this to list the most recent events matching the given filters, including custom key filter expressions.
      Can be used to fetch sample crashes and exceptions for an issue,
      which will include stack traces and other data useful for debugging.`,
    humanReadableDescription:
      "List recent crash and exception events matching specified filters for an issue.",
    inputSchema: z.object({
      appId: ApplicationIdSchema,
      filter: EventFilterSchema,
      filterExpression: FilterExpressionSchema,
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
  async ({ appId, filter, filterExpression, pageSize }) => {
    const result: CallToolResult = { content: [] };
    if (!appId) {
      result.isError = true;
      result.content.push({ type: "text", text: "Must specify 'appId' parameter" });
      result.content.push({ type: "text", text: forceAppIdGuide });
    }
    if (!filter || (!filter.issueId && !filter.issueVariantId)) {
      result.isError = true;
      result.content.push({
        type: "text",
        text: `Must specify 'filter.issueId' or 'filter.issueVariantId' parameters.`,
      });
    }
    if (result.content.length > 0) {
      // There are errors or guides the agent must read
      return result;
    }
    // Otherwise continue and list events
    const response: ListEventsResponse = await listEvents(
      appId,
      filter,
      pageSize,
      filterExpression,
    );
    const eventsContent = response.events?.map((e) => toText(e)) || [];
    return {
      content: [{ type: "text", text: dump(eventsContent, EVENT_DUMP_OPTIONS) }],
    };
  },
);

export const batch_get_events = tool(
  "crashlytics",
  {
    name: "batch_get_events",
    description: `Gets specific events by resource name.
      Can be used to fetch sample crashes and exceptions for an issue,
      which will include stack traces and other data useful for debugging.`,
    humanReadableDescription:
      "Retrieve sample crash and exception events by resource name for debugging.",
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
    const result: CallToolResult = { content: [] };
    if (!appId) {
      result.isError = true;
      result.content.push({ type: "text", text: "Must specify 'appId' parameter." });
      result.content.push({ type: "text", text: forceAppIdGuide });
    }
    if (!names || names.length === 0) {
      result.isError = true;
      result.content.push({
        type: "text",
        text: "Must provide event resource names in name parameter.",
      });
    }
    if (result.content.length > 0) {
      // There are errors or guides the agent must read
      return result;
    }
    // Otherwise continue and get events
    const response: BatchGetEventsResponse = await batchGetEvents(appId, names);
    const eventsContent = response.events?.map((e) => toText(e)) || [];
    return {
      content: [{ type: "text", text: dump(eventsContent, EVENT_DUMP_OPTIONS) }],
    };
  },
);

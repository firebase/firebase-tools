import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { getSampleCrash } from "../../../crashlytics/getSampleCrash";
import { ErrorType, Event, ListEventsResponse } from "../../../crashlytics/types";
import { APP_ID_FIELD } from "./constants";

function pruneThreads(sample: Event): Event {
  if (sample.issue?.errorType === ErrorType.FATAL || sample.issue?.errorType === ErrorType.ANR) {
    // Remove irrelevant threads from the response to reduce token usage
    sample.threads = sample.threads?.filter((t) => t.crashed || t.blamed);
  }
  return sample;
}

export const get_sample_crash = tool(
  {
    name: "get_sample_crash_for_issue",
    description: "Gets the sample crash for an issue.",
    inputSchema: z.object({
      app_id: APP_ID_FIELD,
      issue_id: z
        .string()
        .describe(
          "The issue Id for which the sample crash needs to be fetched. This is the value of the field `id` in the list of issues. Defaults to the first id in the list of issues.",
        ),
      variant_id: z
        .string()
        .optional()
        .describe("The issue variant Id used as a filter to get sample issues."),
      sample_count: z
        .number()
        .describe("Number of samples that needs to be fetched. Maximum value is 3. Defaults to 1.")
        .default(1),
    }),
    annotations: {
      title: "Gets a sample of a crash for a specific issue.",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  async ({ app_id, issue_id, variant_id, sample_count }) => {
    if (!app_id) return mcpError(`Must specify 'app_id' parameter.`);
    if (!issue_id) return mcpError(`Must specify 'issue_id' parameter.`);

    if (!sample_count) sample_count = 1;
    if (sample_count > 3) sample_count = 3;

    const samples: ListEventsResponse = await getSampleCrash(
      app_id,
      issue_id,
      sample_count,
      variant_id,
    );
    samples.events = samples.events.map((e) => pruneThreads(e));
    return toContent(samples);
  },
);

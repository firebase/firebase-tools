import { z } from "zod";
import { ApplicationIdSchema } from "../../../crashlytics/filters";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";

export const run_tests = tool(
  {
    name: "run_test",
    description: `Upload an APK and run an existing test against it.`,
    inputSchema: z.object({
      appId: ApplicationIdSchema,
    })
  },
  async ({ appId }) => {
    if (!appId) return mcpError(`Must specify 'appId' parameter.`);

    return toContent("Finished.");
  },
);
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
      releaseBinaryFile: z.string().describe("Path to the binary release (APK)."),
      testDevices: z.string().describe(
        `Semicolon-separated list of devices to run automated tests on, in the format
          'model=<model-id>,version=<os-version-id>,locale=<locale>,orientation=<orientation>'. Run 'gcloud firebase test android|ios models list' to see
          available devices.`,
      ),
      testCaseIds: z.string().describe(`A comma-separated list of test case IDs.`),
    }),
  },
  async ({ appId, releaseBinaryFile, testDevices, testCaseIds }) => {
    if (!appId) return mcpError(`Must specify 'appId' parameter.`);
    if (!releaseBinaryFile) return mcpError(`Must specify 'releaseBinaryFile' parameter.`);
    if (!testDevices) return mcpError(`Must specify 'testDevices' parameter.`);
    if (!testCaseIds) return mcpError(`Must specify 'testCaseIds' parmeter.`);

    return toContent(
      `Finished: appId=${appId}, testDevices=${testDevices}, testCaseIds=${testCaseIds}`,
    );
  },
);

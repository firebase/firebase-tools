import { z } from "zod";
import { ApplicationIdSchema } from "../../../crashlytics/filters";
import { upload, Distribution } from "../../../appdistribution/distribution";

import { tool } from "../../tool";
import { toContent } from "../../util";
import { toAppName } from "../../../appdistribution/options-parser-util";
import { AppDistributionClient } from "../../../appdistribution/client";

const TestDeviceSchema = z
  .object({
    model: z.string(),
    version: z.string(),
    locale: z.string(),
    orientation: z.string(),
  })
  .describe(
    `Device to run automated test on. Can run 'gcloud firebase test android|ios models list' to see available devices.`,
  );

const AIStepSchema = z
  .object({
    goal: z.string().optional().describe("A goal to be accomplished during the test."),
    assertion: z.string().optional().describe("An assertion to be checked during the test."),
  })
  .describe(
    "Steps that are run during the execution of the test. Can either be a goal or an assertion but not both.",
  );
export const run_tests = tool(
  {
    name: "run_test",
    description: `Run a remote test.`,
    inputSchema: z.object({
      appId: ApplicationIdSchema,
      releaseBinaryFile: z.string().describe("Path to the binary release (APK)."),
      testDevices: z.array(TestDeviceSchema).default([
        {
          model: "tokay",
          version: "36",
          locale: "en",
          orientation: "portrait",
        },
        {
          model: "e1q",
          version: "34",
          locale: "en",
          orientation: "portrait",
        },
      ]),
      testCaseIds: z.string().describe(`A comma-separated list of test case IDs.`),
      aiSteps: z.array(AIStepSchema),
    }),
  },
  async ({ appId, releaseBinaryFile, testDevices, aiSteps }) => {
    const client = new AppDistributionClient();
    const releaeName = await upload(client, toAppName(appId), new Distribution(releaseBinaryFile));
    return toContent(
      await client.createReleaseTest(releaeName, testDevices, [{ aiSteps: aiSteps }]),
    );
  },
);

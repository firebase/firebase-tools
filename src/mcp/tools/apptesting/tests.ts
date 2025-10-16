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
    goal: z.string().describe("A goal to be accomplished during the test."),
    hint: z
      .string()
      .optional()
      .describe("Hint text containing suggestions to help the agent accomplish the goal."),
    successCriteria: z
      .string()
      .optional()
      .describe(
        "A description of criteria the agent should use to determine if the goal has been successfully completed.",
      ),
  })
  .describe("Step within a test case; run during the execution of the test.");

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
      testCase: z
        .array(AIStepSchema)
        .describe("Test case containing the steps that are run during its execution."),
    }),
    annotations: {
      title: "Run a Remote Test",
      readOnlyHint: false,
    },
  },
  async ({ appId, releaseBinaryFile, testDevices, testCase }) => {
    const client = new AppDistributionClient();
    const releaeName = await upload(client, toAppName(appId), new Distribution(releaseBinaryFile));
    return toContent(await client.createReleaseTest(releaeName, testDevices, { steps: testCase }));
  },
);

export const check_test = tool(
  {
    name: "check_test",
    description: "Check the status of a remote test.",
    inputSchema: z.object({
      name: z.string().describe("The name of the release test returned by the run_test tool."),
    }),
    annotations: {
      title: "Check Remote Test",
      readOnlyHint: true,
    },
  },
  async ({ name }) => {
    const client = new AppDistributionClient();
    return toContent(await client.getReleaseTest(name));
  },
);

import { z } from "zod";
import { ApplicationIdSchema } from "../../../crashlytics/filters";
import { upload, Distribution } from "../../../appdistribution/distribution";

import { tool } from "../../tool";
import { toContent } from "../../util";
import { toAppName } from "../../../appdistribution/options-parser-util";
import { AppDistributionClient } from "../../../appdistribution/client";
import { testEnvironmentCatalog } from "../../../gcp/apptesting";

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
    finalScreenAssertion: z
      .string()
      .optional()
      .describe(
        "A description of criteria the agent should use to determine if the goal has been successfully completed.",
      ),
  })
  .describe("Step within a test case; run during the execution of the test.");

const defaultDevices = [
  {
    model: "MediumPhone.arm",
    version: "30",
    locale: "en_US",
    orientation: "portrait",
  },
];

export const run_tests = tool(
  "apptesting",
  {
    name: "run_test",
    description: `Run a remote test.`,
    inputSchema: z.object({
      appId: ApplicationIdSchema,
      releaseBinaryFile: z.string().describe("Path to the binary release (APK)."),
      testDevices: z.array(TestDeviceSchema).default(defaultDevices),
      testCase: z.object({
        steps: z
          .array(AIStepSchema)
          .describe("Test case containing the steps that are run during its execution."),
      }),
    }),
    annotations: {
      title: "Run a Remote Test",
      readOnlyHint: false,
    },
  },
  async ({ appId, releaseBinaryFile, testDevices, testCase }) => {
    // For some reason, testDevices can still be
    const devices = testDevices || defaultDevices;
    const client = new AppDistributionClient();
    const releaseName = await upload(client, toAppName(appId), new Distribution(releaseBinaryFile));
    return toContent(await client.createReleaseTest(releaseName, devices, testCase));
  },
);

export const check_status = tool(
  "apptesting",
  {
    name: "check_status",
    description:
      "Check the status of an apptesting release test and/or get available devices that can be used for automated tests ",
    inputSchema: z.object({
      release_test_name: z
        .string()
        .optional()
        .describe(
          "The name of the release test returned by the run_test tool. If set, the tool will fetch the release test",
        ),
      getAvailableDevices: z
        .boolean()
        .optional()
        .describe(
          "If set to true, the tool will get the available devices that can be used for automated tests using the app testing agent",
        ),
    }),
    annotations: {
      title: "Check Remote Test",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ release_test_name, getAvailableDevices }, { projectId }) => {
    let devices = undefined;
    let releaseTest = undefined;
    if (release_test_name) {
      const client = new AppDistributionClient();
      releaseTest = await client.getReleaseTest(release_test_name);
    }
    if (getAvailableDevices) {
      devices = await testEnvironmentCatalog(projectId || "", "ANDROID");
    }

    const result: Record<string, any> = {};
    if (devices) result.devices = devices;
    if (releaseTest) result.releaseTest = releaseTest;

    return toContent(result);
  },
);

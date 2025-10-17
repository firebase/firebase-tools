import { z } from "zod";
import { ApplicationIdSchema } from "../../../crashlytics/filters";
import { upload, Distribution } from "../../../appdistribution/distribution";

import { tool } from "../../tool";
import { toContent } from "../../util";
import { getLoginCredential, toAppName } from "../../../appdistribution/options-parser-util";
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

const DEFAULT_DEVICES = [
  {
    model: "MediumPhone.arm",
    version: "30",
    locale: "en_US",
    orientation: "portrait",
  },
];

export const run_tests = tool(
  {
    name: "run_test",
    description: `Run a remote test.`,
    inputSchema: z.object({
      appId: ApplicationIdSchema,
      releaseBinaryFile: z.string().describe("Path to the binary release (APK)."),
      testDevices: z.array(TestDeviceSchema).default(DEFAULT_DEVICES),
      testCase: z
        .array(AIStepSchema)
        .describe("Test case containing the steps that are run during its execution."),
      testUsername: z
        .string()
        .describe(
          "The username for automatic login to be used during automated tests. If your test requires login, you must set this value.",
        )
        .optional(),
      testUsernameResource: z
        .string()
        .describe(
          "Resource name for the username field for automatic login to be used during automated tests.",
        )
        .optional(),
      testPassword: z
        .string()
        .describe(
          "The password for automatic login to be used during automated tests. If your test requires login, you MUST set this value or `testPasswordFile`.",
        )
        .optional(),
      testPasswordFile: z
        .string()
        .describe(
          "The path to a plain text file containing a password for automatic login to be used during automated tests. If your test requires login, you MUST set this value or `testPassword`.",
        )
        .optional(),
      testPasswordResource: z
        .string()
        .describe(
          "The resource name for the password field for automatic login to be used during automated tests.",
        )
        .optional(),
    }),
    annotations: {
      title: "Run a Remote Test",
      readOnlyHint: false,
    },
  },
  async ({
    appId,
    releaseBinaryFile,
    testDevices,
    testCase,
    testUsername,
    testPassword,
    testPasswordFile,
    testUsernameResource,
    testPasswordResource,
  }) => {
    const client = new AppDistributionClient();
    const releaseName = await upload(client, toAppName(appId), new Distribution(releaseBinaryFile));
    // Even though we set a default with zod, testDevices can still be undefined 🤔
    const devices = testDevices || DEFAULT_DEVICES;
    const loginCredential = getLoginCredential({
      username: testUsername,
      password: testPassword,
      passwordFile: testPasswordFile,
      usernameResourceName: testUsernameResource,
      passwordResourceName: testPasswordResource,
    });
    const aiInstruction = { steps: testCase };
    return toContent(
      await client.createReleaseTest({
        releaseName,
        devices,
        aiInstruction,
        loginCredential,
      }),
    );
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

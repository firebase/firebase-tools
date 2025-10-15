import { z } from "zod";
import { ApplicationIdSchema } from "../../../crashlytics/filters";
import { distribute, Distribution } from "../../../appdistribution/distribution";

import { tool } from "../../tool";
import { toContent } from "../../util";
import { parseIntoStringArray, toAppName } from "../../../appdistribution/options-parser-util";

const TestDeviceSchema = z
  .object({
    model: z.string(),
    version: z.string(),
    locale: z.string(),
    orientation: z.enum(["portrait", "landscape"]),
  })
  .describe(
    `Device to run automated test on. Can run 'gcloud firebase test android|ios models list' to see available devices.`,
  );

export const run_tests = tool(
  {
    name: "run_test",
    description: "Upload a binary and run automated tests.",
    inputSchema: z.object({
      appId: ApplicationIdSchema,
      releaseBinaryFile: z.string().describe("Path to the binary release (APK)."),
      testDevices: z.array(TestDeviceSchema).default([
        {
          model: "MediumPhone.arm",
          version: "30",
          locale: "en_US",
          orientation: "portrait",
        },
      ]),
      testCaseIds: z.string().describe(`A comma-separated list of test case IDs.`),
    }),
  },
  async ({ appId, releaseBinaryFile, testDevices, testCaseIds }) => {
    return toContent(
      await distribute(
        toAppName(appId),
        new Distribution(releaseBinaryFile),
        parseIntoStringArray(testCaseIds),
        testDevices,
      ),
    );
  },
);

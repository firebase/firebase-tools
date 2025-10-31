import { z } from "zod";
import { tool } from "../../tool";
import { google } from "googleapis";
import { toContent } from "../../util";
import { getAccessToken } from "../../../apiv2";

export const get_devices = tool(
  "apptesting",
  {
    name: "get_devices",
    description:
      "Get available devices that can be used for automated tests using the app testing agent",
    inputSchema: z.object({
      type: z.enum(["ANDROID"]).describe("The type of device"),
    }),
  },
  async ({ type }) => {
    const testing = google.testing("v1");
    return toContent(
      await testing.testEnvironmentCatalog.get({
        oauth_token: await getAccessToken(),
        environmentType: type,
      }),
    );
  },
);

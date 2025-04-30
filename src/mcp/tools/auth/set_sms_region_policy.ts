import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import { setAllowSmsRegionPolicy, setDenySmsRegionPolicy } from "../../../gcp/auth.js";
import { NO_PROJECT_ERROR } from "../../errors.js";

export const set_sms_region_policy = tool(
  {
    name: "set_sms_region_policy",
    description:
      "Sets an SMS Region Policy for your Firebase project to restrict the regions which can recieve text messages based on an allow or deny list",
    inputSchema: z.object({
      allow_list: z
        .boolean()
        .describe("true for allow these countries, false for deny these countries"),
      country_codes: z
        .array(z.string())
        .describe("the country codes to allow or deny based on ISO 3166"),
    }),
    annotations: {
      title: "Set the SMS Region Policy on your Firebase Project",
      idempotentHint: true,
      destructiveHint: true,
    },
  },
  async ({ allow_list, country_codes }, { projectId }) => {
    if (!projectId) return NO_PROJECT_ERROR;
    country_codes = country_codes.map((code) => {
      return code.toUpperCase();
    });
    if (allow_list) {
      return toContent(await setAllowSmsRegionPolicy(projectId, country_codes));
    }
    return toContent(await setDenySmsRegionPolicy(projectId, country_codes));
  },
);

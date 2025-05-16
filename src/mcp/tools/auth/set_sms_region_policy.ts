import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import { setAllowSmsRegionPolicy, setDenySmsRegionPolicy } from "../../../gcp/auth.js";

export const set_sms_region_policy = tool(
  {
    name: "set_sms_region_policy",
    description:
      "Sets an SMS Region Policy for Firebase Auth to restrict the regions which can receive text messages based on an ALLOW or DENY list of country codes. This policy will override any existing policies when set.",
    inputSchema: z.object({
      policy_type: z
        .enum(["ALLOW", "DENY"])
        .describe(
          "with an ALLOW policy, only the specified country codes can use SMS auth. with a DENY policy, all countries can use SMS auth except the ones specified",
        ),
      country_codes: z
        .array(z.string())
        .describe("the country codes to allow or deny based on ISO 3166"),
    }),
    annotations: {
      title: "Set SMS Region Policy",
      idempotentHint: true,
      destructiveHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
  },
  async ({ policy_type, country_codes }, { projectId }) => {
    country_codes = country_codes.map((code) => {
      return code.toUpperCase();
    });
    if (policy_type === "ALLOW") {
      return toContent(await setAllowSmsRegionPolicy(projectId!, country_codes));
    }
    return toContent(await setDenySmsRegionPolicy(projectId!, country_codes));
  },
);

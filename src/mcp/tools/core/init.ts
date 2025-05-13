import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import { actuate, Setup } from "../../../init/index.js";

export const init = tool(
  {
    name: "init",
    description: "Initialize the Firebase Products.",
    inputSchema: z.object({
      features: z.object({
        // TODO: Add all the features here.
        dataconnect: z.object({
          serviceId: z.string().optional().describe("The Firebase Data Connect service ID to setup."),
          locationId: z.string().default("us-central1").describe("The GCP region ID to set up the Firebase Data Connect service. For example, us-central1."),
        }),
      }),
    }),
    annotations: {
      title: "List the Firebase Data Connect Services that's available in the backend",
      readOnlyHint: false,
    },
    _meta: {
      requiresProject: false, // Can start from stratch.
      requiresAuth: false, // Will throw error if the specific feature needs it.
    },
  },
  async ({features}, { projectId, config, rc }) => {
    const setup: Setup = {
      config: config.src,
      rcfile: rc.data,
      projectId,
      features: [],
      featureInfo: {},
    };
    if (features.dataconnect) {
      setup.features.push("dataconnect");
      setup.featureInfo.dataconnect = features.dataconnect;
    }
    await actuate(setup, config, {});
    return toContent(
      `The Firebase Data Connect Services has been initialized. You can now use the Firebase Data Connect Services.`,
    );
  },
);

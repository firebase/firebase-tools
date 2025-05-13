import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import { actuate, Setup, SetupInfo } from "../../../init/index.js";

export const init = tool(
  {
    name: "init",
    description: "Initialize the Firebase Products. Provide the desired features information.",
    inputSchema: z.object({
      features: z.object({
        // TODO: Add all the features here.
        dataconnect: z.object({
          serviceId: z
            .string()
            .optional()
            .describe(
              "The Firebase Data Connect service ID to initialize. Default to match the current folder name.",
            ),
          locationId: z
            .string()
            .default("us-central1")
            .describe("The GCP region ID to set up the Firebase Data Connect service."),
          cloudSqlInstanceId: z
            .string()
            .optional()
            .describe("The GCP Cloud SQL instance ID to use in the Firebase Data Connect service."),
          cloudSqlDatabase: z
            .string()
            .optional()
            .describe("The Postgres database ID to use in the Firebase Data Connect service."),
        }),
      }),
    }),
    annotations: {
      title: "Initialize Firebase Products",
      readOnlyHint: false,
    },
    _meta: {
      requiresProject: false, // Can start from scratch.
      requiresAuth: false, // Will throw error if the specific feature needs it.
    },
  },
  async ({ features }, { projectId, config, rc }) => {
    const featuresList: string[] = [];
    const featureInfo: SetupInfo = {};
    if (features.dataconnect) {
      featuresList.push("dataconnect");
      featureInfo.dataconnect = {
        serviceId: features.dataconnect.serviceId || "",
        locationId: features.dataconnect.locationId || "",
        cloudSqlInstanceId: features.dataconnect.cloudSqlInstanceId || "",
        cloudSqlDatabase: features.dataconnect.cloudSqlDatabase || "",
        connectors: [], // TODO populate with GiF,
        isNewInstance: false,
        isNewDatabase: false,
        schemaGql: [], // TODO populate with GiF
        shouldProvisionCSQL: false,
      };
    }

    const setup: Setup = {
      config: config?.src,
      rcfile: rc?.data,
      projectId: projectId,
      features: [...featuresList],
      featureInfo: featureInfo,
    };
    // Set force to true to avoid prompting the user for confirmation.
    await actuate(setup, config, { force: true });
    return toContent(
      `Successfully setup the project ${projectId} with those features: ${featuresList.join(", ")}`,
    );
  },
);

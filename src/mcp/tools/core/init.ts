import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import { DEFAULT_RULES } from "../../../init/features/database.js";
import { actuate, Setup, SetupInfo } from "../../../init/index.js";

export const init = tool(
  {
    name: "init",
    description:
      "Initializes selected Firebase features in the workspace (Firestore, Data Connect, Realtime Database). All features are optional; provide only the products you wish to set up. " +
      "You can initialize new features into an existing project directory, but re-initializing an existing feature may overwrite configuration. " +
      "To deploy the initialized features, run the `firebase deploy` command after `firebase_init` tool.",
    inputSchema: z.object({
      features: z.object({
        database: z
          .object({
            rules_filename: z
              .string()
              .optional()
              .default("database.rules.json")
              .describe("The file to use for Realtime Database Security Rules."),
            rules: z
              .string()
              .optional()
              .default(DEFAULT_RULES)
              .describe("The security rules to use for Realtime Database Security Rules."),
          })
          .optional()
          .describe(
            "Provide this object to initialize Firebase Realtime Database in this project directory.",
          ),
        firestore: z
          .object({
            database_id: z
              .string()
              .optional()
              .default("(default)")
              .describe("The database ID to use for Firestore."),
            location_id: z
              .string()
              .optional()
              .default("nam5")
              .describe("The GCP region ID to set up the Firestore database."),
            rules_filename: z
              .string()
              .optional()
              .default("firestore.rules")
              .describe("The file to use for Firestore Security Rules."),
            rules: z
              .string()
              .optional()
              .describe(
                "The security rules to use for Firestore Security Rules. Default to open rules that expire in 30 days.",
              ),
          })
          .optional()
          .describe("Provide this object to initialize Cloud Firestore in this project directory."),
        dataconnect: z
          .object({
            service_id: z
              .string()
              .optional()
              .describe(
                "The Firebase Data Connect service ID to initialize. Default to match the current folder name.",
              ),
            location_id: z
              .string()
              .optional()
              .default("us-central1")
              .describe("The GCP region ID to set up the Firebase Data Connect service."),
            cloudsql_instance_id: z
              .string()
              .optional()
              .describe(
                "The GCP Cloud SQL instance ID to use in the Firebase Data Connect service. By default, use <serviceId>-fdc.",
              ),
            cloudsql_database: z
              .string()
              .optional()
              .default("fdcdb")
              .describe("The Postgres database ID to use in the Firebase Data Connect service."),
          })
          .optional()
          .describe(
            "Provide this object to initialize Firebase Data Connect in this project directory.",
          ),
        storage: z
          .object({
            rules_filename: z
              .string()
              .optional()
              .default("storage.rules")
              .describe("The file to use for Firebase Storage Security Rules."),
            rules: z
              .string()
              .optional()
              .describe(
                "The security rules to use for Firebase Storage Security Rules. Default to closed rules that deny all access.",
              ),
          })
          .optional()
          .describe(
            "Provide this object to initialize Firebase Storage in this project directory.",
          ),
      }),
    }),
    annotations: {
      title: "Initialize Firebase Products",
      readOnlyHint: false,
      idempotentHint: true,
    },
    _meta: {
      requiresProject: false, // Can start from scratch.
      requiresAuth: false, // Will throw error if the specific feature needs it.
    },
  },
  async ({ features }, { projectId, config, rc }) => {
    const featuresList: string[] = [];
    const featureInfo: SetupInfo = {};
    if (features.database) {
      featuresList.push("database");
      featureInfo.database = {
        rulesFilename: features.database.rules_filename,
        rules: features.database.rules,
        writeRules: true,
      };
    }
    if (features.firestore) {
      featuresList.push("firestore");
      featureInfo.firestore = {
        databaseId: features.firestore.database_id,
        locationId: features.firestore.location_id,
        rulesFilename: features.firestore.rules_filename,
        rules: features.firestore.rules || "",
        writeRules: true,
        indexesFilename: "",
        indexes: "",
        writeIndexes: true,
      };
    }
    if (features.dataconnect) {
      featuresList.push("dataconnect");
      featureInfo.dataconnect = {
        serviceId: features.dataconnect.service_id || "",
        locationId: features.dataconnect.location_id || "",
        cloudSqlInstanceId: features.dataconnect.cloudsql_instance_id || "",
        cloudSqlDatabase: features.dataconnect.cloudsql_database || "",
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
    config.writeProjectFile("firebase.json", setup.config);
    config.writeProjectFile(".firebaserc", setup.rcfile);
    return toContent(
      `Successfully setup the project ${projectId} with those features: ${featuresList.join(", ")}` +
        " To deploy them, you can run `firebase deploy` in command line.",
    );
  },
);

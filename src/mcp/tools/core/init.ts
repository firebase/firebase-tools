import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import { DEFAULT_RULES } from "../../../init/features/database";
import { actuate, Setup, SetupInfo } from "../../../init/index";
import { freeTrialTermsLink } from "../../../dataconnect/freeTrial";
import { requireGeminiToS } from "../../errors";
import { Emulators } from "../../../emulator/types";

const emulatorHostPortSchema = z.object({
  host: z.string().optional().describe("The host to use for the emulator."),
  port: z.number().optional().describe("The port to use for the emulator."),
});

export const init = tool(
  {
    name: "init",
    description:
      "Initializes selected Firebase features in the workspace (Firestore, Data Connect, Realtime Database, Emulators). All features are optional; provide only the products you wish to set up. " +
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
            app_description: z
              .string()
              .optional()
              .describe(
                "Provide a description of the app you are trying to build. If present, Gemini will help generate Data Connect Schema, Connector and seed data",
              ),
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
                "The GCP Cloud SQL instance ID to use in the Firebase Data Connect service. By default, use <serviceId>-fdc. " +
                  "\nSet `provision_cloudsql` to true to start Cloud SQL provisioning.",
              ),
            cloudsql_database: z
              .string()
              .optional()
              .default("fdcdb")
              .describe("The Postgres database ID to use in the Firebase Data Connect service."),
            provision_cloudsql: z
              .boolean()
              .optional()
              .default(false)
              .describe(
                "If true, provision the Cloud SQL instance if `cloudsql_instance_id` does not exist already. " +
                  `\nThe first Cloud SQL instance in the project will use the Data Connect no-cost trial. See its terms of service: ${freeTrialTermsLink()}.`,
              ),
          })
          .optional()
          .describe(
            "Provide this object to initialize Firebase Data Connect with Cloud SQL Postgres in this project directory.\n" +
              "It installs Data Connect Generated SDKs in all detected apps in the folder.",
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
        emulators: z
          .object({
            auth: emulatorHostPortSchema.optional(),
            database: emulatorHostPortSchema.optional(),
            firestore: emulatorHostPortSchema.optional(),
            functions: emulatorHostPortSchema.optional(),
            hosting: emulatorHostPortSchema.optional(),
            storage: emulatorHostPortSchema.optional(),
            pubsub: emulatorHostPortSchema.optional(),
            ui: z
              .object({
                enabled: z.boolean().optional(),
                host: z.string().optional(),
                port: z.number().optional(),
              })
              .optional(),
            singleProjectMode: z
              .boolean()
              .optional()
              .describe("If true, do not warn on detection of multiple project IDs."),
          })
          .optional()
          .describe(
            "Provide this object to configure Firebase emulators in this project directory.",
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
      if (features.dataconnect.app_description) {
        // If app description is provided, ensure the Gemini in Firebase API is enabled.
        const err = await requireGeminiToS(projectId);
        if (err) return err;
      }
      featuresList.push("dataconnect");
      featureInfo.dataconnect = {
        analyticsFlow: "mcp",
        appDescription: features.dataconnect.app_description || "",
        serviceId: features.dataconnect.service_id || "",
        locationId: features.dataconnect.location_id || "",
        cloudSqlInstanceId: features.dataconnect.cloudsql_instance_id || "",
        cloudSqlDatabase: features.dataconnect.cloudsql_database || "",
        shouldProvisionCSQL: !!features.dataconnect.provision_cloudsql,
      };
      featureInfo.dataconnectSdk = {
        // Add FDC generated SDKs to all apps detected.
        apps: [],
      };
    }
    if (features.storage?.rules) {
      featuresList.push("storage");
      featureInfo.storage = {
        rulesFilename: features.storage.rules_filename,
        rules: features.storage.rules,
        writeRules: true,
      };
    }
    if (features.emulators) {
      featuresList.push("emulators");
      const emulatorKeys = Object.keys(features.emulators).filter(
        (key) =>
          key !== "ui" &&
          key !== "singleProjectMode" &&
          Object.values(Emulators).includes(key as Emulators),
      ) as Emulators[];

      featureInfo.emulators = {
        emulators: emulatorKeys,
        config: features.emulators,
        download: true, // Non-interactive, so default to downloading.
      };
    }

    const setup: Setup = {
      config: config?.src || {},
      rcfile: rc?.data,
      projectId: projectId,
      features: [...featuresList],
      featureInfo: featureInfo,
      instructions: [],
    };
    // Set force to true to avoid prompting the user for confirmation.
    await actuate(setup, config, { force: true });
    config.writeProjectFile("firebase.json", setup.config);
    config.writeProjectFile(".firebaserc", setup.rcfile);

    if (featureInfo.dataconnectSdk && !featureInfo.dataconnectSdk.apps.length) {
      setup.instructions.push(
        `No app is found in the current folder. We recommend you create an app (web, ios, android) first, then re-run the 'firebase_init' MCP tool with the same input without app_description to add Data Connect SDKs to your apps.
  Consider popular commands like 'npx create-react-app my-app', 'npx create-next-app my-app', 'flutter create my-app', etc`,
      );
    }
    return toContent(
      `Successfully setup those features: ${featuresList.join(", ")}

To get started:

- ${setup.instructions.join("\n\n- ")}
`,
    );
  },
);

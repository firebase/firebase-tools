import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import { DEFAULT_RULES } from "../../../init/features/database";
import { actuate, Setup, SetupInfo } from "../../../init/index";
import { freeTrialTermsLink } from "../../../dataconnect/freeTrial";
import { ServerToolContext } from "../../tool";
import {
  AppInput,
  resolveAppContext,
  handleConfigFileConflict,
  createNewAppDirectory,
} from "./app-context";
import { IProvisioningService, ProvisionFirebaseAppOptions } from "./provisioning-interface";
// import { ProvisioningService } from "./provision-service";
import { MockProvisioningService } from "./mock-provision";
import { writeConfigFile, extractProjectIdFromAppResource, updateFirebaseRC } from "./config-utils";
import { AppPlatform } from "../../../management/apps";

interface ProvisioningInput {
  enable?: boolean;
}

// Extended context for init tool with optional provisioning service injection
interface InitToolContext extends ServerToolContext {
  provisioningService?: IProvisioningService;
}

interface ProjectInput {
  parent?: string;
}

interface AppInput {
  platform?: string;
  bundleId?: string;
  packageName?: string;
  webAppId?: string;
}

/**
 * Validates provisioning inputs for required fields and format
 */
export function validateProvisioningInputs(
  provisioning?: ProvisioningInput,
  project?: ProjectInput,
  app?: AppInput,
): void {
  if (!provisioning?.enable) return;

  if (!app) {
    throw new Error("app is required when provisioning is enabled");
  }

  const { platform } = app;
  if (!platform) {
    throw new Error("app.platform is required when provisioning is enabled");
  }

  if (platform === "ios" && !app.bundleId) {
    throw new Error("bundle_id is required for iOS apps");
  }
  if (platform === "android" && !app.packageName) {
    throw new Error("package_name is required for Android apps");
  }
  if (platform === "web" && !app.webAppId) {
    throw new Error("web_app_id is required for Web apps");
  }

  if (project?.parent) {
    const validParentPattern = /^(projects|folders|organizations)\/[\w-]+$/;
    if (!validParentPattern.test(project.parent)) {
      throw new Error(
        "parent must be in format: 'projects/id', 'folders/id', or 'organizations/id'",
      );
    }
  }
}

// Type aliases for better readability and reusability
type McpProjectInput = ProjectInput & {
  display_name?: string;
  location?: string;
};

type McpAppInput = AppInput & {
  app_store_id?: string;
  team_id?: string;
  sha1_hashes?: string[];
  sha256_hashes?: string[];
};

/**
 * Converts MCP inputs to provisioning API format
 */
export function buildProvisionOptionsFromMcpInputs(
  project?: McpProjectInput,
  app?: McpAppInput,
  features?: { ai_logic?: boolean },
): ProvisionFirebaseAppOptions {
  if (!project?.display_name || !app?.platform) {
    throw new Error("Project display name and app platform are required for provisioning");
  }

  // Build app options based on platform with proper validation
  let appOptions: any;
  switch (app.platform) {
    case "ios":
      if (!app.bundleId) {
        throw new Error("bundleId is required for iOS apps");
      }
      appOptions = {
        platform: AppPlatform.IOS,
        bundleId: app.bundleId,
        appStoreId: app.app_store_id,
        teamId: app.team_id,
      };
      break;
    case "android":
      if (!app.packageName) {
        throw new Error("packageName is required for Android apps");
      }
      appOptions = {
        platform: AppPlatform.ANDROID,
        packageName: app.packageName,
        sha1Hashes: app.sha1_hashes,
        sha256Hashes: app.sha256_hashes,
      };
      break;
    case "web":
      if (!app.webAppId) {
        throw new Error("webAppId is required for Web apps");
      }
      appOptions = {
        platform: AppPlatform.WEB,
        webAppId: app.webAppId,
      };
      break;
    default:
      throw new Error(`Unsupported platform: ${app.platform}`);
  }

  const provisionOptions: ProvisionFirebaseAppOptions = {
    project: {
      displayName: project.display_name,
    },
    app: appOptions,
  };

  // Handle parent resource if specified
  if (project.parent) {
    const parts = project.parent.split("/");
    if (parts.length === 2) {
      const [type, id] = parts;
      switch (type) {
        case "projects":
          provisionOptions.project.parent = { type: "existing_project", projectId: id };
          break;
        case "folders":
          provisionOptions.project.parent = { type: "folder", folderId: id };
          break;
        case "organizations":
          provisionOptions.project.parent = { type: "organization", organizationId: id };
          break;
      }
    }
  }

  // Add features if specified
  if (project.location || features?.ai_logic) {
    provisionOptions.features = {};
    if (project.location) {
      provisionOptions.features.location = project.location;
    }
    if (features?.ai_logic) {
      provisionOptions.features.firebaseAiLogicInput = { enableAiLogic: true };
    }
  }

  return provisionOptions;
}

export const init = tool(
  {
    name: "init",
    description:
      "Initializes selected Firebase features in the workspace (Firestore, Data Connect, Realtime Database, Firebase AI Logic). All features are optional; provide only the products you wish to set up. " +
      "You can initialize new features into an existing project directory, but re-initializing an existing feature may overwrite configuration. " +
      "To deploy the initialized features, run the `firebase deploy` command after `firebase_init` tool.",
    inputSchema: z.object({
      provisioning: z
        .object({
          enable: z.boolean().describe("Enable Firebase project/app provisioning via API"),
          overwrite_project: z
            .boolean()
            .optional()
            .default(false)
            .describe("Allow overwriting existing project in .firebaserc"),
          overwrite_configs: z
            .boolean()
            .optional()
            .default(false)
            .describe("Allow overwriting existing config files"),
        })
        .optional()
        .describe("Control how provisioning behaves and handles conflicts"),

      project: z
        .object({
          display_name: z.string().optional().describe("Display name for the Firebase project"),
          parent: z
            .string()
            .optional()
            .describe(
              "Parent resource: 'projects/existing-id', 'folders/123', or 'organizations/456'",
            ),
          location: z
            .string()
            .optional()
            .describe("GCP region for resources (used by AI Logic and future products)"),
        })
        .optional()
        .describe("Project context for provisioning or configuration"),

      app: z
        .object({
          platform: z.enum(["ios", "android", "web"]).describe("Platform for the app"),
          bundle_id: z
            .string()
            .optional()
            .describe("iOS bundle identifier (required for iOS platform)"),
          package_name: z
            .string()
            .optional()
            .describe("Android package name (required for Android platform)"),
          web_app_id: z
            .string()
            .optional()
            .describe("Web app identifier (required for Web platform)"),
          app_store_id: z.string().optional().describe("iOS App Store ID (optional)"),
          team_id: z.string().optional().describe("iOS Team ID (optional)"),
          sha1_hashes: z
            .array(z.string())
            .optional()
            .describe("Android SHA1 certificate hashes (optional)"),
          sha256_hashes: z
            .array(z.string())
            .optional()
            .describe("Android SHA256 certificate hashes (optional)"),
        })
        .optional()
        .describe("App context for provisioning or configuration"),

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
        ai_logic: z
          .boolean()
          .optional()
          .describe("Enable Firebase AI Logic feature (requires provisioning to be enabled)"),
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
  async (
    { features, provisioning, project, app },
    { projectId, config, rc, provisioningService }: InitToolContext,
  ) => {
    validateProvisioningInputs(provisioning, project, app);

    // Handle provisioning if enabled
    if (provisioning?.enable && project && app) {
      const service: IProvisioningService = provisioningService || new MockProvisioningService(); // Use injected service or default to mock

      try {
        // Build provisioning options from MCP inputs
        const provisionOptions = buildProvisionOptionsFromMcpInputs(project, app, features);

        // Provision Firebase app
        const response = await service.provisionFirebaseApp(provisionOptions);

        // Extract project ID from app resource
        const provisionedProjectId = extractProjectIdFromAppResource(response.appResource);

        // Update .firebaserc with the provisioned project ID
        updateFirebaseRC(rc, provisionedProjectId, provisioning.overwrite_project || false);

        // Resolve app context (existing vs new directory)
        let appContext = await resolveAppContext(process.cwd(), app);

        // Create directory if needed
        if (appContext.shouldCreateDirectory) {
          appContext = await createNewAppDirectory(process.cwd(), appContext.platform, app);
        }

        // Handle config file conflicts if needed
        handleConfigFileConflict(
          appContext.configFilePath,
          provisioning.overwrite_configs || false,
        );

        // Write config file to the resolved path
        await writeConfigFile(
          appContext.configFilePath,
          response.configData,
          response.configMimeType,
        );

        // Update context with provisioned project ID for subsequent operations
        projectId = provisionedProjectId;
      } catch (error) {
        throw new Error(
          `Provisioning failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

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
    if (features.ai_logic) {
      featuresList.push("ai_logic");
      featureInfo.ailogic = {};
    }
    const setup: Setup = {
      config: config?.src,
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

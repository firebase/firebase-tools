import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import { createAndroidApp, createIosApp, createWebApp } from "../../../management/apps";

const CREATE_APP_OUTUT_PREFIX = "Created app with the following details:\n\n";
const CREATE_APP_OUTUT_SUFFIX =
  "\n\nTo fetch the SDK configuration for this app, use the firebase_get_sdk_config tool.";

export const create_app = tool(
  {
    name: "create_app",
    description: "Creates a new app in your Firebase project for Web, iOS, or Android.",
    inputSchema: z.object({
      display_name: z
        .string()
        .optional()
        .describe(
          "The user-friendly display name for your app. If not provided, a default name may be generated.",
        ),
      platform: z
        .enum(["web", "ios", "android"])
        .describe("The platform for which to create an app."),
      android_config: z
        .object({
          package_name: z
            .string()
            .describe("The package name for your Android app (e.g., com.example.myapp)."),
        })
        .optional()
        .describe("Configuration for Android apps. Required if platform is 'android'."),
      ios_config: z
        .object({
          bundle_id: z
            .string()
            .describe("The bundle ID for your iOS app (e.g., com.example.myapp)."),
          app_store_id: z.string().optional().describe("The App Store ID for your iOS app."),
        })
        .optional()
        .describe("Configuration for iOS apps. Required if platform is 'ios'."),
    }),
    annotations: {
      title: "Create Firebase App",
      destructiveHint: false,
      readOnlyHint: false,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ display_name, platform, android_config, ios_config }, { projectId }) => {
    if (platform === "android" && !android_config) {
      throw new Error("Android configuration is required when platform is 'android'");
    }
    if (platform === "ios" && !ios_config) {
      throw new Error("iOS configuration is required when platform is 'ios'");
    }

    try {
      switch (platform) {
        case "android":
          return toContent(
            await createAndroidApp(projectId, {
              displayName: display_name,
              packageName: android_config!.package_name,
            }),
            {
              format: "yaml",
              contentPrefix: CREATE_APP_OUTUT_PREFIX,
              contentSuffix: CREATE_APP_OUTUT_SUFFIX,
            },
          );
        case "ios":
          return toContent(
            await createIosApp(projectId, {
              displayName: display_name,
              bundleId: ios_config!.bundle_id,
              appStoreId: ios_config!.app_store_id,
            }),
            {
              format: "yaml",
              contentPrefix: CREATE_APP_OUTUT_PREFIX,
              contentSuffix: CREATE_APP_OUTUT_SUFFIX,
            },
          );
        case "web":
          return toContent(
            await createWebApp(projectId, {
              displayName: display_name,
            }),
            {
              format: "yaml",
              contentPrefix: CREATE_APP_OUTUT_PREFIX,
              contentSuffix: CREATE_APP_OUTUT_SUFFIX,
            },
          );
      }
    } catch (err: any) {
      const originalMessage = err.original ? `: ${err.original.message}` : "";
      throw new Error(`${err.message}\nOriginal error: ${originalMessage}`);
    }
  },
);

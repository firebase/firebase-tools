import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import { createAndroidApp, createIosApp, createWebApp } from "../../../management/apps.js";

export const create_app = tool(
  {
    name: "create_app",
    description: "Creates a new app in your Firebase project for Web, iOS, or Android.",
    inputSchema: z.object({
      displayName: z.string().optional().describe("The user-friendly display name for your app."),
      platform: z
        .enum(["web", "ios", "android"])
        .describe("The platform for which to create an app."),
      androidConfig: z
        .object({
          packageName: z
            .string()
            .describe("The package name for your Android app (e.g., com.example.myapp)."),
        })
        .optional()
        .describe("Configuration for Android apps."),
      iosConfig: z
        .object({
          bundleId: z
            .string()
            .describe("The bundle ID for your iOS app (e.g., com.example.myapp)."),
          appStoreId: z
            .string()
            .optional()
            .describe("The App Store ID for your iOS app (optional)."),
        })
        .optional()
        .describe("Configuration for iOS apps."),
    }),
    annotations: {
      title: "Create App",
      destructiveHint: false,
      readOnlyHint: false,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ displayName, platform, androidConfig, iosConfig }, { projectId }) => {
    if (platform === "android" && !androidConfig) {
      throw new Error("Android configuration is required when platform is 'android'");
    }
    if (platform === "ios" && !iosConfig) {
      throw new Error("iOS configuration is required when platform is 'ios'");
    }

    try {
      switch (platform) {
        case "android":
          return toContent(
            await createAndroidApp(projectId!, {
              displayName,
              packageName: androidConfig!.packageName,
            }),
          );
        case "ios":
          return toContent(
            await createIosApp(projectId!, {
              displayName,
              bundleId: iosConfig!.bundleId,
              appStoreId: iosConfig!.appStoreId,
            }),
          );
        case "web":
          return toContent(
            await createWebApp(projectId!, {
              displayName,
            }),
          );
      }
    } catch (err: any) {
      const originalMessage = err.original ? `: ${err.original.message}` : "";
      throw new Error(`${err.message}\nOriginal error: ${originalMessage}`);
    }
  },
);

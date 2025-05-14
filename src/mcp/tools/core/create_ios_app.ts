import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import { createIosApp } from "../../../management/apps.js";

export const create_ios_app = tool(
  {
    name: "create_ios_app",
    description: "Creates a new iOS app in your Firebase project.",
    inputSchema: z.object({
      displayName: z
        .string()
        .optional()
        .describe("The user-friendly display name for your iOS app."),
      bundleId: z.string().describe("The bundle ID for your iOS app (e.g., com.example.iosapp)."),
      appStoreId: z.string().optional().describe("The App Store ID for your iOS app (optional)."),
    }),
    annotations: {
      title: "Create iOS App",
      destructiveHint: false,
      readOnlyHint: false,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ displayName, bundleId, appStoreId }, { projectId }) => {
    const iosApp = await createIosApp(projectId!, {
      displayName,
      bundleId,
      appStoreId,
    });

    return toContent(iosApp);
  },
);

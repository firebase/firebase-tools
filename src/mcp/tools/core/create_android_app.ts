import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent, mcpError } from "../../util.js";
import { createAndroidApp } from "../../../management/apps.js";

export const create_android_app = tool(
  {
    name: "create_android_app",
    description: "Creates a new Android app in your Firebase project.",
    inputSchema: z.object({
      displayName: z.string().optional().describe("The user-friendly display name for your Android app."),
      packageName: z.string().describe("The package name for your Android app (e.g., com.example.myapp)."),
    }),
    annotations: {
      title: "Create Android App",
      destructiveHint: false,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ displayName, packageName }, { projectId }) => {
    try {
      const androidApp = await createAndroidApp(projectId!, {
        displayName,
        packageName,
      });
      
      return toContent(androidApp);
    } catch (error) {
      return mcpError(error);
    }
  },
);

import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent, mcpError } from "../../util.js";
import { createWebApp } from "../../../management/apps.js";

export const create_web_app = tool(
  {
    name: "create_web_app",
    description: "Creates a new Web app in your Firebase project.",
    inputSchema: z.object({
      displayName: z.string().optional().describe("The user-friendly display name for your Web app."),
    }),
    annotations: {
      title: "Create Web App",
      destructiveHint: false,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ displayName }, { projectId }) => {
    try {
      const webApp = await createWebApp(projectId!, {
        displayName,
      });
      
      return toContent(webApp);
    } catch (error) {
      return mcpError(error);
    }
  },
);

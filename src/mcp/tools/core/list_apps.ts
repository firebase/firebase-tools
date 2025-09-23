import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import { AppPlatform, listFirebaseApps } from "../../../management/apps";

export const list_apps = tool(
  {
    name: "list_apps",
    description: "Retrieves apps registered in the current Firebase project.",
    inputSchema: z.object({
      platform: z
        .enum(["ios", "android", "web", "all"])
        .optional()
        .describe("the specific platform to list (omit to list all platforms)"),
    }),
    annotations: {
      title: "List Firebase Apps",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
  },
  async ({ platform }, { projectId }) => {
    try {
      const apps = await listFirebaseApps(
        projectId!,
        !platform || platform === "all" ? AppPlatform.ANY : (platform.toUpperCase() as AppPlatform),
      );
      return toContent(apps);
    } catch (err: any) {
      const originalMessage = err.original ? `: ${err.original.message}` : "";
      throw new Error(`Failed to list Firebase apps${originalMessage}`);
    }
  },
);

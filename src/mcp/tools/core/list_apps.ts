import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import { AppPlatform, listFirebaseApps } from "../../../management/apps.js";

export const list_apps = tool(
  {
    name: "list_apps",
    description: "Retrieves apps registered in the current Firebase project.",
    inputSchema: z.object({
      platform: z
        .enum(["ios", "android", "web"])
        .nullish()
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
    const apps = await listFirebaseApps(
      projectId!,
      (platform?.toUpperCase() as AppPlatform) ?? AppPlatform.ANY,
    );
    return toContent(apps);
  },
);

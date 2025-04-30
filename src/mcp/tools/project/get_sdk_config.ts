import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { AppPlatform, getAppConfig, listFirebaseApps } from "../../../management/apps.js";

export const get_sdk_config = tool(
  {
    name: "get_sdk_config",
    description:
      "Retrieves the Firebase SDK configuration information for the specified platform. You must specify either a platform or an app_id.",
    inputSchema: z.object({
      platform: z
        .enum(["ios", "android", "web"])
        .nullish()
        .describe("the platform for which you want config"),
      app_id: z.string().nullish().describe("the specific app id to fetch"),
    }),
    annotations: {
      title: "Get Firebase SDK Config",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
  },
  async ({ platform: inputPlatform, app_id: appId }, { projectId }) => {
    let platform = inputPlatform?.toUpperCase() as AppPlatform;
    if (!platform && !appId)
      return mcpError(
        "Must specify one of 'web', 'ios', or 'android' for platform or an app_id for get_sdk_config tool.",
      );
    const apps = await listFirebaseApps(projectId!, platform ?? AppPlatform.ANY);
    platform = platform || apps.find((app) => app.appId === appId)?.platform;
    appId = appId || apps.find((app) => app.platform === platform)?.appId;
    if (!appId)
      return mcpError(
        `Could not find an app for platform '${inputPlatform}' in project '${projectId}'`,
      );
    const sdkConfig = await getAppConfig(appId, platform);
    // TODO: return as string with comment about filename for ios and android
    return toContent(sdkConfig, { format: "json" });
  },
);

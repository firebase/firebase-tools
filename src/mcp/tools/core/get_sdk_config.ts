import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { AppPlatform, getAppConfig, listFirebaseApps } from "../../../management/apps";

export const get_sdk_config = tool(
  {
    name: "get_sdk_config",
    description:
      "Use this to retrieve the Firebase configuration information for a Firebase App. " +
      "You must specify EITHER a platform OR the Firebase App ID for a Firebase App registered in the currently active Firebase Project.",
    inputSchema: z.object({
      platform: z
        .enum(["ios", "android", "web"])
        .optional()
        .describe(
          "The platform for which you want config. One of 'platform' or 'app_id' must be provided.",
        ),
      app_id: z
        .string()
        .optional()
        .describe("The specific app ID to fetch. One of 'platform' or 'app_id' must be provided."),
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
    const apps = await listFirebaseApps(projectId, platform ?? AppPlatform.ANY);
    platform = platform || apps.find((app) => app.appId === appId)?.platform;
    appId = appId || apps.find((app) => app.platform === platform)?.appId;
    if (!appId)
      return mcpError(
        `Could not find an app for platform '${inputPlatform}' in project '${projectId}'`,
      );
    const sdkConfig = await getAppConfig(appId, platform);
    if ("configFilename" in sdkConfig) {
      return {
        content: [
          {
            type: "text",
            text: `SDK config content for \`${sdkConfig.configFilename}\`:\n\n\`\`\`\n${Buffer.from(sdkConfig.configFileContents, "base64").toString("utf-8")}\n\`\`\``,
          },
        ],
      };
    }

    return toContent(sdkConfig, { format: "json" });
  },
);

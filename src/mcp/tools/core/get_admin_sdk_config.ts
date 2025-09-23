import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { getProjectAdminSdkConfigOrCached } from "../../../emulator/adminSdkConfig";

export const get_admin_sdk_config = tool(
  {
    name: "get_admin_sdk_config",
    description: "Gets the Admin SDK config for the current project. ",
    inputSchema: z.object({}),
    annotations: {
      title: "Get Admin SDK Config",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async (_, { projectId }) => {
    const adminSdkConfig = await getProjectAdminSdkConfigOrCached(projectId || "");
    if (!adminSdkConfig) {
      return mcpError(`No Admin SDK configuration found in project '${projectId || ""}'`);
    }
    return toContent(adminSdkConfig);
  },
);

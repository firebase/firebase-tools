import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { publishTemplate } from "../../../remoteconfig/publish.js";
import { RemoteConfigTemplate } from "../../../remoteconfig/interfaces.js";

export const publish_rc_template = tool(
  {
    name: "publish_template",
    description:
      "Publishes a new remote config template for the project." +
      "Provide a 'version' in the template body to update a specific version." +
      "Alternatively, set 'force' to true to update the most recent version.,",
    inputSchema: z.object({
      template: z.object({}).describe("Remote Config template in JSON format"),
      force: z.boolean().optional().describe("Set to true to update the latest template"),
    }),
    annotations: {
      title: "Publish Remote Config template",
      readOnlyHint: false,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ template, force }, { projectId }) => {
    if (template === undefined) {
      return mcpError(`No template specified in the publish requests`);
    }
    if ((template as RemoteConfigTemplate).version === undefined) {
      force = true;
    }
    if (force === undefined) {
      return toContent(await publishTemplate(projectId!, template as RemoteConfigTemplate));
    }
    return toContent(
      await publishTemplate(projectId!, template as RemoteConfigTemplate, { force }),
    );
  },
);

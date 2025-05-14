import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { publishTemplate } from "../../../remoteconfig/publish.js";
import { RemoteConfigTemplate } from "../../../remoteconfig/interfaces.js";

export const publish_rc_template = tool(
  {
    name: "publish_template",
    description: "Publishes a new remote config template for the project",
    inputSchema: z.object({
      template: z.object({}),
      force: z.boolean().optional(),
    }),
    annotations: {
      title: "Publish remote config template",
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
    if (force === undefined) {
      return toContent(await publishTemplate(projectId!, template as RemoteConfigTemplate));
    }
    return toContent(
      await publishTemplate(projectId!, template as RemoteConfigTemplate, { force }),
    );
  },
);

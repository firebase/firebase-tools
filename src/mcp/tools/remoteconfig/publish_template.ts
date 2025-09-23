import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { publishTemplate } from "../../../remoteconfig/publish";
import { RemoteConfigTemplate } from "../../../remoteconfig/interfaces";

export const publish_template = tool(
  {
    name: "publish_template",
    description: "Publishes a new remote config template for the project",
    inputSchema: z.object({
      template: z.object({}).describe("The Remote Config template object to publish."),
      force: z
        .boolean()
        .optional()
        .describe(
          "If true, the publish will bypass ETag validation and overwrite the current template. Defaults to false if not provided.",
        ),
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
    if (force === undefined) {
      return toContent(await publishTemplate(projectId, template as RemoteConfigTemplate));
    }
    return toContent(await publishTemplate(projectId, template as RemoteConfigTemplate, { force }));
  },
);

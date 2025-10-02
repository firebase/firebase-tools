import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { publishTemplate } from "../../../remoteconfig/publish";
import { rollbackTemplate } from "../../../remoteconfig/rollback";
import { RemoteConfigTemplate } from "../../../remoteconfig/interfaces";

export const update_template = tool(
  {
    name: "update_template",
    description:
      "Publishes a new remote config template or rolls back to a specific version for the project",
    inputSchema: z
      .object({
        template: z.object({}).optional().describe("The Remote Config template object to publish."),
        version_number: z
          .number()
          .optional()
          .describe("The version number to roll back to."),
        force: z
          .boolean()
          .optional()
          .describe(
            "If true, the publish will bypass ETag validation and overwrite the current template. Defaults to false if not provided.",
          ),
      })
      .refine(
        (data) =>
          (data.template && !data.version_number) || (!data.template && data.version_number),
        {
          message:
            "Either provide a template for publish, or a version number to rollback to, but not both.",
        },
      ),
    annotations: {
      title: "Update Remote Config template",
      readOnlyHint: false,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ template, version_number, force }, { projectId }) => {
    if (version_number) {
      return toContent(await rollbackTemplate(projectId, version_number!));
    }

    if (template) {
      if (force === undefined) {
        return toContent(await publishTemplate(projectId, template as any as RemoteConfigTemplate));
      }
      return toContent(
        await publishTemplate(projectId, template as any as RemoteConfigTemplate, { force }),
      );
    }

    // This part should not be reached due to the refine validation, but as a safeguard:
    return mcpError("Either a template or a version number must be specified.");
  },
);

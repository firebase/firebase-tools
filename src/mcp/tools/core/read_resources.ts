import { z } from "zod";
import { tool } from "../../tool";
import { resolveResource, resources } from "../../resources";
import { toContent } from "../../util";

export const read_resources = tool(
  {
    name: "read_resources",
    description:
      "use this to read the contents of `firebase://` resources or list available resources",
    annotations: {
      title: "Read Firebase Resources",
      destructiveHint: false,
      readOnlyHint: true,
    },
    inputSchema: z.object({
      uris: z
        .array(z.string())
        .optional()
        .describe(
          "list of resource uris to read. each must start with `firebase://` prefix. omit to list all available resources",
        ),
    }),
  },
  async ({ uris }, ctx) => {
    if (!uris?.length) {
      return toContent(
        resources
          .map(
            (r) =>
              `Available resources:\n\n- [${r.mcp.title || r.mcp.name}](${r.mcp.uri}): ${r.mcp.description}`,
          )
          .join("\n"),
      );
    }

    const out: string[] = [];
    for (const uri of uris) {
      const resolved = await resolveResource(uri, ctx);
      if (!resolved) {
        out.push(`<resource uri="${uri}" error>\nRESOURCE NOT FOUND\n</resource>`);
        continue;
      }
      out.push(
        `<resource uri="${uri}" title="${resolved.mcp.title || resolved.mcp.name}">\n${resolved.result.contents.map((c) => c.text).join("")}\n</resource>`,
      );
    }

    return toContent(out.join("\n\n"));
  },
);

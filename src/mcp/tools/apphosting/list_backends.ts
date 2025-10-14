import { z } from "zod";
import { tool } from "../../tool";
import { McpContext } from "../../types";
import { checkFeatureActive, toContent } from "../../util";
import {
  Backend,
  Domain,
  getTraffic,
  listBackends,
  listDomains,
  parseBackendName,
  Traffic,
} from "../../../gcp/apphosting";

export const list_backends = tool(
  {
    name: "list_backends",
    description:
      "Use this to retrieve a list of App Hosting backends in the current project. An empty list means that there are no backends. " +
      "The `uri` is the public URL of the backend. " +
      "A working backend will have a `managed_resources` array that will contain a `run_service` entry. That `run_service.service` " +
      "is the resource name of the Cloud Run service serving the App Hosting backend. The last segment of that name is the service ID. " +
      "`domains` is the list of domains that are associated with the backend. They either have type `CUSTOM` or `DEFAULT`. " +
      "  Every backend should have a `DEFAULT` domain. " +
      "  The actual domain that a user would use to connect to the backend is the last parameter of the domain resource name. " +
      "  If a custom domain is correctly set up, it will have statuses ending in `ACTIVE`.",
    inputSchema: z.object({
      location: z
        .string()
        .optional()
        .default("-")
        .describe(
          "Limit the listed backends to this region. By default, it will list all backends across all regions.",
        ),
    }),
    annotations: {
      title: "List App Hosting backends.",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
    isAvailable: async (ctx: McpContext) => {
      return await checkFeatureActive("apphosting", ctx.projectId, { config: ctx.config });
    },
  },
  async ({ location } = {}, { projectId }) => {
    projectId = projectId || "";
    if (!location) location = "-";
    const backends = await listBackends(projectId, location);
    if (!backends.backends.length) {
      return toContent(
        `No backends exist for project ${projectId}${location !== "-" ? ` in ${location}` : ""}.`,
      );
    }

    const promises = backends.backends.map(async (backend) => {
      const { location, id } = parseBackendName(backend.name);
      const [traffic, domains] = await Promise.all([
        getTraffic(projectId, location, id),
        listDomains(projectId, location, id),
      ]);
      return { ...backend, traffic: traffic, domains: domains };
    });
    const data: (Backend & { traffic: Traffic; domains: Domain[] })[] = await Promise.all(promises);
    return toContent(data);
  },
);

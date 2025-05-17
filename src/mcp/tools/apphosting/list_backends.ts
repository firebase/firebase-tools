import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import { NO_PROJECT_ERROR } from "../../errors.js";
import {
  Backend,
  getTraffic,
  listBackends,
  parseBackendName,
  Traffic,
} from "../../../gcp/apphosting.js";

export const list_backends = tool(
  {
    name: "list_backends",
    description:
      "Retrieves a list of App Hosting backends in the current project. An empty list means that there are no backends. " +
      "The `uri` is the public URL of the backend. " +
      "A working backend will have a `managed_resources` array that will contain a `run_service` entry. That `run_service.service` " +
      "is the resource name of the Cloud Run service serving the App Hosting backend. The last segment of that name is the service ID.",
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
  },
  async ({ location } = {}, { projectId }) => {
    if (!projectId) return NO_PROJECT_ERROR;
    if (!location) location = "-";
    const data: (Backend & { traffic: Traffic })[] = [];
    const backends = await listBackends(projectId, location);
    for (const backend of backends.backends) {
      const { location, id } = parseBackendName(backend.name);
      const traffic = await getTraffic(projectId, location, id);
      data.push({ ...backend, traffic: traffic });
    }
    return toContent(data);
  },
);

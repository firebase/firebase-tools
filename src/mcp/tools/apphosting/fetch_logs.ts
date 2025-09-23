import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import { Backend, getBackend, getTraffic, listBuilds, Traffic } from "../../../gcp/apphosting";
import { last } from "../../../utils";
import { FirebaseError } from "../../../error";
import { fetchServiceLogs } from "../../../gcp/run";
import { listEntries } from "../../../gcp/cloudlogging";

export const fetch_logs = tool(
  {
    name: "fetch_logs",
    description:
      "Fetches the most recent logs for a specified App Hosting backend. If `buildLogs` is specified, the logs from the build process for the latest build are returned. The most recent logs are listed first.",
    inputSchema: z.object({
      buildLogs: z
        .boolean()
        .default(false)
        .describe(
          "If specified, the logs for the most recent build will be returned instead of the logs for the service. The build logs are returned 'in order', to be read from top to bottom.",
        ),
      backendId: z.string().describe("The ID of the backend for which to fetch logs."),
      location: z
        .string()
        .describe(
          "The specific region for the backend. By default, if a backend is uniquely named across all locations, that one will be used.",
        ),
    }),
    annotations: {
      title: "Fetch logs for App Hosting backends and builds.",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ buildLogs, backendId, location } = {}, { projectId }) => {
    location ||= "";
    if (!backendId) {
      return toContent(`backendId must be specified.`);
    }
    const backend = await getBackend(projectId, location, backendId);
    const traffic = await getTraffic(projectId, location, backendId);
    const data: Backend & { traffic: Traffic } = { ...backend, traffic };

    if (buildLogs) {
      const builds = await listBuilds(projectId, location, backendId);
      builds.builds.sort(
        (a, b) => new Date(a.createTime).getTime() - new Date(b.createTime).getTime(),
      );
      const build = last(builds.builds);
      const r = new RegExp(`region=${location}/([0-9a-f-]+)?`);
      const match = r.exec(build.buildLogsUri ?? "");
      if (!match) {
        throw new FirebaseError("Unable to determine the build ID.");
      }
      const buildId = match[1];
      // Thirty days ago makes sure we get any saved data within the default retention period.
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const timestampFilter = `timestamp >= "${thirtyDaysAgo.toISOString()}"`;
      const filter = `resource.type="build" resource.labels.build_id="${buildId}" ${timestampFilter}`;
      const entries = await listEntries(projectId, filter, 100, "asc");
      if (!Array.isArray(entries) || !entries.length) {
        return toContent("No logs found.");
      }
      return toContent(entries);
    }

    const serviceName = last(data.managedResources)?.runService.service;
    if (!serviceName) {
      throw new FirebaseError("Unable to get service name from managedResources.");
    }
    const serviceId = last(serviceName.split("/"));
    const logs = await fetchServiceLogs(projectId, serviceId);
    return toContent(logs);
  },
);

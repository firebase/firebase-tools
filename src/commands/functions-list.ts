import { Command } from "../command";
import { needProjectId } from "../projectUtils";
import { Options } from "../options";
import { requirePermissions } from "../requirePermissions";
import * as backend from "../deploy/functions/backend";
import { logger } from "../logger";
import * as Table from "cli-table3";
import { listServices, endpointFromService } from "../gcp/runv2";

export const command = new Command("functions:list")
  .description("list all deployed functions in your Firebase project")
  .before(requirePermissions, ["run.services.list"])
  .action(async (options: Options) => {
    const projectId = needProjectId(options);

    let services: Service[] = [];
    try {
      logger.info(`Listing functions in project ${projectId}...`);
      services = await listServices(projectId);
    } catch (err: any) {
      logger.debug(`Failed to list services:`, err);
      logger.error(
        `Failed to list functions. Ensure you have the Cloud Run Admin API enabled and the necessary permissions.`,
      );
      return [];
    }

    if (services.length === 0) {
      logger.info(`No functions found in project ${projectId}.`);
      return [];
    }

    const endpointsList = services
      .map((service) => endpointFromService(service))
      .sort(backend.compareFunctions);

    const table = new Table({
      head: ["Function", "Platform", "Trigger", "Location", "Memory", "Runtime"],
      style: { head: ["yellow"] },
    });

    for (const endpoint of endpointsList) {
      const trigger = backend.endpointTriggerType(endpoint);
      const availableMemoryMb = endpoint.availableMemoryMb || "---";
      const entry = [
        endpoint.id,
        endpoint.platform,
        trigger,
        endpoint.region,
        availableMemoryMb,
        endpoint.runtime,
      ];
      table.push(entry);
    }
    logger.info(table.toString());
    return endpointsList;
  });

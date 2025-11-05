import { Command } from "../command";
import * as args from "../deploy/functions/args";
import { needProjectId } from "../projectUtils";
import { Options } from "../options";
import { requirePermissions } from "../requirePermissions";
import * as backend from "../deploy/functions/backend";
import { logger } from "../logger";
import * as Table from "cli-table3";
import { listServices, endpointFromService } from "../gcp/runv2";

export const command = new Command("functions:list")
  .description("list all deployed functions in your Firebase project")
  .before(requirePermissions, ["cloudfunctions.functions.list", "run.services.list"])
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const context = {
      projectId,
    } as args.Context;

    let v1Endpoints: backend.Endpoint[] = [];
    try {
      const existing = await backend.existingBackend(context);
      v1Endpoints = backend.allEndpoints(existing);
    } catch (err: any) {
      logger.debug(`Failed to list v1 functions:`, err);
      logger.warn(
        `Failed to list v1 functions. Ensure you have the Cloud Functions API enabled and the necessary permissions.`,
      );
    }

    let v2Endpoints: backend.Endpoint[] = [];
    try {
      const services = await listServices(projectId);
      v2Endpoints = services.map((service) => endpointFromService(service));
    } catch (err: any) {
      logger.debug(`Failed to list v2 functions:`, err);
      logger.warn(
        `Failed to list v2 functions. Ensure you have the Cloud Run Admin API enabled and the necessary permissions.`,
      );
    }

    const endpointsList = [...v1Endpoints, ...v2Endpoints].sort(backend.compareFunctions);

    if (endpointsList.length === 0) {
      logger.info(`No functions found in project ${projectId}.`);
      return [];
    }

    const table = new Table({
      head: ["Function", "Version", "Trigger", "Location", "Memory", "Runtime"],
      style: { head: ["yellow"] },
    });

    for (const endpoint of endpointsList) {
      const trigger = backend.endpointTriggerType(endpoint);
      const availableMemoryMb = endpoint.availableMemoryMb || "---";
      const entry = [
        endpoint.id,
        endpoint.platform === "gcfv2" ? "v2" : endpoint.platform === "run" ? "run" : "v1",
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

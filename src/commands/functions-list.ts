import { Command } from "../command";
import * as args from "../deploy/functions/args";
import { needProjectId } from "../projectUtils";
import { requirePermissions } from "../requirePermissions";
import * as backend from "../deploy/functions/backend";
import { logger } from "../logger";
import * as Table from "cli-table3";
import { Options } from "../options";
import { FunctionsPlatform } from "../deploy/functions/backend";

type PLATFORM_DISPLAY_NAME = "v1" | "v2" | "run";
const PLATFORM_TO_DISPLAY_NAME: Record<FunctionsPlatform, PLATFORM_DISPLAY_NAME> = {
  gcfv1: "v1",
  gcfv2: "v2",
  run: "run",
};

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

    const endpointMap = new Map<string, backend.Endpoint>();
    for (const endpoint of v1Endpoints) {
      const key = `${endpoint.region}/${endpoint.id}`;
      endpointMap.set(key, endpoint);
    }

    const endpoints = Array.from(endpointMap.values());
    endpoints.sort(backend.compareFunctions);

    if (endpoints.length === 0) {
      logger.info(`No functions found in project ${projectId}.`);
      return [];
    }

    const table = new Table({
      head: ["Function", "Version", "Trigger", "Location", "Memory", "Runtime"],
      style: { head: ["yellow"] },
    }) as any;

    for (const endpoint of endpoints) {
      const trigger = backend.endpointTriggerType(endpoint);
      const availableMemoryMb = endpoint.availableMemoryMb || "---";
      const entry = [
        endpoint.id,
        PLATFORM_TO_DISPLAY_NAME[endpoint.platform] || "v1",
        trigger,
        endpoint.region,
        availableMemoryMb,
        endpoint.runtime,
      ];
      table.push(entry);
    }
    logger.info(table.toString());
    return endpoints;
  });

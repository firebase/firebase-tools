import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as appcheck from "../gcp/appcheck";
import * as ensureApiEnabled from "../ensureApiEnabled";
import * as clc from "colorette";
import { logger } from "../logger";
import * as Table from "cli-table3";

import { Options } from "../options";

function colorMode(mode: appcheck.EnforcementMode): string {
  switch (mode) {
    case "enforced":
      return clc.green("Enforced");
    case "unenforced":
      return clc.yellow("Unenforced");
    default:
      return clc.red("Off");
  }
}

export const command = new Command("appcheck:services:list")
  .description("list App Check enforcement for each enforceable Firebase service")
  .before(requirePermissions, ["firebaseappcheck.services.get"])
  .action(async (options: Options) => {
    const projectId = needProjectId(options);

    const isEnabled = await ensureApiEnabled.check(
      projectId,
      appcheck.APP_CHECK_API,
      "appcheck",
      true,
    );
    if (!isEnabled) {
      logger.info(
        clc.bold(
          `Firebase App Check is not enabled on project ${projectId}. No services are enforced.`,
        ),
      );
      return [];
    }

    const services = await appcheck.listServices(projectId);
    if (services.length === 0) {
      logger.info(clc.bold("No App Check enforcement is configured for any service."));
      return services;
    }

    const table = new Table({
      head: ["Service", "Resource ID", "Enforcement"],
      style: { head: ["green"] },
    });
    for (const svc of services) {
      table.push([clc.bold(svc.alias), svc.serviceId, colorMode(svc.enforcement)]);
    }
    logger.info(table.toString());
    return services;
  });

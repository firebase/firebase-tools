import * as clc from "colorette";
import * as Table from "cli-table3";

import { Command } from "../command";
import { needProjectNumber } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { logger } from "../logger";
import { logWarning, promiseWithSpinner } from "../utils";
import { listServices } from "../appcheck/api";
import { Service } from "../appcheck/types";
import {
  AI_LOGIC_APP_CHECK_DOCS,
  AI_LOGIC_ENFORCEMENT_DATE,
  ServiceRow,
  buildServiceRows,
  displayNameForServiceId,
  formatEnforcementMode,
  formatUpdateTime,
  isMandatoryFrom,
} from "../appcheck/services";
import { Options } from "../options";

export const command = new Command("appcheck:services:list")
  .description("list App Check enforcement for each service")
  .help(
    `shows whether App Check is enforced for each service in the active project.

Enforcement can be:

  Enforced     requests without a valid App Check token are rejected
  Unenforced   requests are allowed, but counted in the App Check metrics
  Off          App Check is not applied

A service that was never configured also reads as off, with "never" in the Updated column.

Use \`appcheck:services:set <service> <mode>\` to change one.`,
  )
  .before(requireAuth)
  .before(requirePermissions, ["firebaseappcheck.services.get"])
  .action(async (options: Options): Promise<ServiceRow[]> => {
    const projectNumber = await needProjectNumber(options);

    const services = await promiseWithSpinner<Service[]>(
      () => listServices(projectNumber),
      "Reading App Check services",
    );
    const rows = buildServiceRows(services);

    const table = new Table({
      head: ["Service", "Service API", "Enforcement", "Replay Protection", "Updated"],
      style: { head: ["green"] },
    });
    for (const row of rows) {
      table.push([
        clc.bold(row.alias),
        displayNameForServiceId(row.serviceId),
        formatEnforcementMode(row.enforcementMode ?? undefined),
        formatEnforcementMode(row.replayProtection ?? undefined),
        formatUpdateTime(row.updateTime ?? undefined),
      ]);
    }
    logger.info(table.toString());

    // AI Logic becomes mandatory on a known date, so an unenforced row there is
    // a deadline, not just a setting.
    const aiLogic = rows.find((row) => isMandatoryFrom(row.serviceId));
    if (aiLogic && aiLogic.enforcementMode !== "ENFORCED") {
      logWarning(
        `App Check is not enforced for ${aiLogic.alias}. Starting ${AI_LOGIC_ENFORCEMENT_DATE}, Firebase will automatically enforce App Check for all Gemini API requests via Firebase AI Logic. Requests without a valid App Check token will be rejected. Implement App Check before this date to avoid service interruptions: ${AI_LOGIC_APP_CHECK_DOCS}`,
      );
    }

    return rows;
  });

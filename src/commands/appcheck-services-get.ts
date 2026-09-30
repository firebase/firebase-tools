import * as clc from "colorette";

import { Command } from "../command";
import { needProjectNumber } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { logger } from "../logger";
import { logWarning } from "../utils";
import { getService } from "../appcheck/api";
import { Service } from "../appcheck/types";
import {
  AI_LOGIC_APP_CHECK_DOCS,
  AI_LOGIC_ENFORCEMENT_DATE,
  aliasForServiceId,
  displayNameForServiceId,
  formatEnforcementMode,
  formatUpdateTime,
  isMandatoryFrom,
  resolveServiceId,
  serviceAliasHelp,
} from "../appcheck/services";
import { Options } from "../options";

export const command = new Command("appcheck:services:get <service>")
  .description("show App Check enforcement for one service")
  .help(
    `shows the App Check enforcement settings for one service.

<service> is one of:

${serviceAliasHelp()}

App Check also protects some Google services that are not Firebase products, such as the Maps JavaScript API and Google Identity for iOS. Those have no short name; pass their App Check service id if you need them.

For example:

  \`firebase appcheck:services:get firestore\``,
  )
  .before(requireAuth)
  .before(requirePermissions, ["firebaseappcheck.services.get"])
  .action(async (service: string, options: Options): Promise<Service> => {
    // Check the name here: the API answers an unknown service id with a plain
    // 400 that does not say what the valid ones are.
    const serviceId = resolveServiceId(service);
    const projectNumber = await needProjectNumber(options);

    const result = await getService(projectNumber, serviceId);

    logger.info(
      `Service:            ${clc.bold(aliasForServiceId(serviceId))} (${displayNameForServiceId(serviceId)})`,
    );
    logger.info(`Enforcement:        ${formatEnforcementMode(result.enforcementMode)}`);
    logger.info(`Replay protection:  ${formatEnforcementMode(result.replayProtection)}`);
    logger.info(`Last updated:       ${formatUpdateTime(result.updateTime)}`);

    if (isMandatoryFrom(serviceId) && result.enforcementMode !== "ENFORCED") {
      logWarning(
        `Starting ${AI_LOGIC_ENFORCEMENT_DATE}, Firebase will automatically enforce App Check for all Gemini API requests via Firebase AI Logic, and App Check cannot be un-enforced for AI Logic. Implement App Check before this date to avoid service interruptions: ${AI_LOGIC_APP_CHECK_DOCS}`,
      );
    }

    return result;
  });

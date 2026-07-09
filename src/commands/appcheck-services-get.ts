import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as appcheck from "../gcp/appcheck";
import * as ensureApiEnabled from "../ensureApiEnabled";
import * as clc from "colorette";
import { logger } from "../logger";

import { Options } from "../options";

export const command = new Command("appcheck:services:get <service>")
  .description("get the App Check enforcement mode for one Firebase service")
  .before(requirePermissions, ["firebaseappcheck.services.get"])
  .action(async (service: string, options: Options) => {
    const projectId = needProjectId(options);
    // Validate the alias up front so a bad name fails clearly, even when the
    // API is not enabled.
    appcheck.resolveServiceId(service);

    const isEnabled = await ensureApiEnabled.check(
      projectId,
      appcheck.APP_CHECK_API,
      "appcheck",
      true,
    );
    if (!isEnabled) {
      logger.info(clc.bold(`Firebase App Check is not enabled on project ${projectId}.`));
      return { enforcement: "off" };
    }

    const svc = await appcheck.getService(projectId, service);
    logger.info(svc.enforcement);
    return svc;
  });

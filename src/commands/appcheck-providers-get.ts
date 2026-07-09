import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as appcheck from "../gcp/appcheck";
import * as ensureApiEnabled from "../ensureApiEnabled";
import * as clc from "colorette";
import { logger } from "../logger";

import { Options } from "../options";

export const command = new Command("appcheck:providers:get <appId> <provider>")
  .description("get one App Check attestation provider config for an app")
  .before(requirePermissions, ["firebaseappcheck.appCheckConfig.get"])
  .action(async (appId: string, provider: string, options: Options) => {
    const projectId = needProjectId(options);
    const providerType = appcheck.parseProviderType(provider);

    const isEnabled = await ensureApiEnabled.check(
      projectId,
      appcheck.APP_CHECK_API,
      "appcheck",
      true,
    );
    if (!isEnabled) {
      logger.info(clc.bold(`Firebase App Check is not enabled on project ${projectId}.`));
      return null;
    }

    const config = await appcheck.getProviderConfig(projectId, appId, providerType);
    if (!config) {
      logger.info(clc.bold(`Provider ${providerType} is not configured for app ${appId}.`));
      return null;
    }
    logger.info(JSON.stringify(config, null, 2));
    return config;
  });

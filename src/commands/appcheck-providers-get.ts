import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as appcheck from "../gcp/appcheck";
import * as ensureApiEnabled from "../ensureApiEnabled";
import { listFirebaseApps, AppPlatform } from "../management/apps";
import * as clc from "colorette";
import { logger } from "../logger";
import { FirebaseError } from "../error";

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

    // getProviderConfig treats a 404 as "not configured", so validate the app
    // exists first to avoid misreporting an unknown app as unconfigured.
    const apps = await listFirebaseApps(projectId, AppPlatform.ANY);
    if (!apps.some((a) => a.appId === appId)) {
      throw new FirebaseError(`App ${clc.bold(appId)} was not found in project ${projectId}.`);
    }

    const config = await appcheck.getProviderConfig(projectId, appId, providerType);
    if (!config) {
      logger.info(clc.bold(`Provider ${providerType} is not configured for app ${appId}.`));
      return null;
    }
    logger.info(JSON.stringify(config, null, 2));
    return config;
  });

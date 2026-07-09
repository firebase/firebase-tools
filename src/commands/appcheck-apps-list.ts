import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as appcheck from "../gcp/appcheck";
import * as ensureApiEnabled from "../ensureApiEnabled";
import { listFirebaseApps, AppPlatform, AppMetadata } from "../management/apps";
import * as clc from "colorette";
import { logger } from "../logger";
import * as Table from "cli-table3";

import { Options } from "../options";

export const command = new Command("appcheck:apps:list")
  .description("list the project's Firebase apps and their App Check provider status")
  .before(requirePermissions, ["firebaseappcheck.appCheckConfig.get"])
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const apps = await listFirebaseApps(projectId, AppPlatform.ANY);

    const appCheckEnabled = await ensureApiEnabled.check(
      projectId,
      appcheck.APP_CHECK_API,
      "appcheck",
      true,
    );

    async function providerColumn(app: AppMetadata): Promise<string> {
      if (!appCheckEnabled) {
        return "(App Check not enabled)";
      }
      const configured = await appcheck.getConfiguredProviders(projectId, app.appId, app.platform);
      return configured.length > 0 ? configured.join(", ") : "(not configured)";
    }

    const rows = await Promise.all(
      apps.map(async (app) => ({ app, provider: await providerColumn(app) })),
    );

    if (rows.length === 0) {
      logger.info(clc.bold("No Firebase apps found in this project."));
      return [];
    }

    const table = new Table({
      head: ["App ID", "Platform", "Display Name", "App Check Provider"],
      style: { head: ["green"] },
    });
    for (const { app, provider } of rows) {
      table.push([clc.bold(app.appId), app.platform, app.displayName ?? "", provider]);
    }
    logger.info(table.toString());
    return rows;
  });

import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as appcheck from "../gcp/appcheck";
import * as ensureApiEnabled from "../ensureApiEnabled";
import { listFirebaseApps, AppPlatform } from "../management/apps";
import * as clc from "colorette";
import { logger } from "../logger";
import * as Table from "cli-table3";

import { Options } from "../options";

export const command = new Command("appcheck:providers:list")
  .description("list the configured App Check attestation providers for each app")
  .option("--app <appId>", "only list providers for one app")
  .before(requirePermissions, ["firebaseappcheck.appCheckConfig.get"])
  .action(async (options: Options) => {
    const projectId = needProjectId(options);

    const isEnabled = await ensureApiEnabled.check(
      projectId,
      appcheck.APP_CHECK_API,
      "appcheck",
      true,
    );
    if (!isEnabled) {
      logger.info(clc.bold(`Firebase App Check is not enabled on project ${projectId}.`));
      return [];
    }

    const appFilter = typeof options.app === "string" ? options.app : undefined;
    let apps = await listFirebaseApps(projectId, AppPlatform.ANY);
    if (appFilter) {
      apps = apps.filter((a) => a.appId === appFilter);
    }

    const table = new Table({
      head: ["App ID", "Platform", "Provider", "Token TTL"],
      style: { head: ["green"] },
    });
    const results: Array<{ appId: string; provider: appcheck.ProviderType; tokenTtl?: string }> =
      [];
    for (const app of apps) {
      const configured = await appcheck.listConfiguredProviders(projectId, app.appId, app.platform);
      if (configured.length === 0) {
        table.push([clc.bold(app.appId), app.platform, clc.dim("(not configured)"), "-"]);
        continue;
      }
      for (const { provider, config } of configured) {
        results.push({ appId: app.appId, provider, tokenTtl: config.tokenTtl });
        table.push([
          clc.bold(app.appId),
          app.platform,
          provider,
          appcheck.formatTokenTtl(config.tokenTtl),
        ]);
      }
    }

    logger.info(table.toString());
    return results;
  });

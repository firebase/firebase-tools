import * as clc from "colorette";
import * as Table from "cli-table3";

import { Command } from "../command";
import { needProjectId, needProjectNumber } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { logger } from "../logger";
import { promiseWithSpinner } from "../utils";
import { AppPlatform, listFirebaseApps } from "../management/apps";
import { batchGetProviderConfigs } from "../appcheck/api";
import { ProviderType } from "../appcheck/types";
import { ATTESTATION_PROVIDERS, isConfigured, providersForPlatform } from "../appcheck/providers";
import { Options } from "../options";

interface AppRow {
  appId: string;
  platform: string;
  displayName: string;
  providers: ProviderType[];
}

/** The app id sits in the middle of a config resource name. */
function appIdFromConfigName(name?: string): string {
  return name?.split("/apps/")[1]?.split("/")[0] ?? "";
}

export const command = new Command("appcheck:apps:list")
  .description("list apps with their App Check attestation providers")
  .help(
    `shows every app in the project with the App Check providers that are set up for it.

Use this to see which apps are ready before turning enforcement on with \`appcheck:services:set\`.

App Attest and Play Integrity are left out of the Providers column: they have no key or secret to register, so the API cannot say whether an app really uses them. Use \`appcheck:providers:list --app <appId>\` to see their settings.`,
  )
  .before(requireAuth)
  .before(requirePermissions, [
    // Provider config permissions are per provider; there is no single
    // appCheckConfig permission. Verified against testIamPermissions.
    "firebaseappcheck.appAttestConfig.get",
    "firebaseappcheck.deviceCheckConfig.get",
    "firebaseappcheck.playIntegrityConfig.get",
    "firebaseappcheck.recaptchaEnterpriseConfig.get",
    "firebaseappcheck.recaptchaV3Config.get",
  ])
  .action(async (options: Options): Promise<AppRow[]> => {
    const projectId = needProjectId(options);
    const projectNumber = await needProjectNumber(options);

    const { apps, configsByProvider } = await promiseWithSpinner(async () => {
      // One batchGet per provider covers every app, so a project with ten
      // apps costs five calls instead of fifty.
      const [appList, ...configLists] = await Promise.all([
        listFirebaseApps(projectId, AppPlatform.ANY),
        ...ATTESTATION_PROVIDERS.map((p) => batchGetProviderConfigs(projectNumber, p)),
      ]);
      return {
        apps: appList,
        configsByProvider: new Map(ATTESTATION_PROVIDERS.map((p, i) => [p, configLists[i]])),
      };
    }, "Reading apps and App Check providers");

    const rows: AppRow[] = apps.map((app) => {
      const providers = providersForPlatform(app.platform).filter((provider) => {
        const config = configsByProvider
          .get(provider)
          ?.find((c) => appIdFromConfigName(c.name) === app.appId);
        // Only the providers we can confirm. isConfigured answers null for the
        // ones with no secret to look at, and those do not belong in this list.
        return Boolean(config && isConfigured(provider, config));
      });
      return {
        appId: app.appId,
        platform: app.platform,
        displayName: app.displayName ?? "",
        providers,
      };
    });

    if (rows.length === 0) {
      logger.info(clc.bold(`No apps found in project ${projectId}.`));
      return rows;
    }

    const table = new Table({
      head: ["App ID", "Platform", "Display Name", "Providers"],
      style: { head: ["green"] },
    });
    for (const row of rows) {
      table.push([
        clc.bold(row.appId),
        row.platform,
        row.displayName,
        row.providers.length ? row.providers.join(", ") : "not configured",
      ]);
    }
    logger.info(table.toString());

    return rows;
  });

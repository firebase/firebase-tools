import * as clc from "colorette";
import * as Table from "cli-table3";

import { Command } from "../command";
import { needProjectNumber } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { logger } from "../logger";
import { promiseWithSpinner } from "../utils";
import { getProviderConfig } from "../appcheck/api";
import { AppCheckProviderOptions, ProviderConfig, ProviderType } from "../appcheck/types";
import {
  formatTokenTtl,
  isConfigured,
  providerHelp,
  providersForPlatform,
  summarizeConfig,
} from "../appcheck/providers";
import { getOrPromptApp } from "./appcheck-prompts";

interface ProviderRow {
  provider: ProviderType;
  configured: boolean | null;
  tokenTtl: string;
  settings: string;
}

function formatConfigured(configured: boolean | null): string {
  if (configured === null) {
    // App Attest and Play Integrity have no secret to set, so the API cannot
    // tell us whether the app actually uses them.
    return "n/a";
  }
  return configured ? "Yes" : "No";
}

export const command = new Command("appcheck:providers:list")
  .description("list App Check attestation providers for an app")
  .help(
    `shows how one app can prove it is real, and which providers are set up.

Only the providers that work on the app's platform are shown:

${providerHelp()}

App Attest and Play Integrity have no key or secret to register, so the API cannot say whether an app really uses them. Those show as "n/a" in the Configured column.

reCAPTCHA now works on iOS and Android as well as web, through the reCAPTCHA attestation provider added to the mobile SDKs in June 2026. It uses the same reCAPTCHA Enterprise settings as the web provider, so configure it with \`recaptcha-enterprise\`. That provider is in public preview on mobile.`,
  )
  .option("--app <appId>", "the app id of your Firebase app")
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
  .action(async (options: AppCheckProviderOptions): Promise<ProviderRow[]> => {
    const { appId, platform } = await getOrPromptApp(
      options,
      "Select the app to list App Check providers for:",
    );
    const projectNumber = await needProjectNumber(options);
    const providers = providersForPlatform(platform);

    const configs = await promiseWithSpinner<ProviderConfig[]>(
      () => Promise.all(providers.map((p) => getProviderConfig(projectNumber, appId, p))),
      `Reading App Check providers for app ${clc.bold(appId)}`,
    );

    const rows: ProviderRow[] = providers.map((provider, i) => ({
      provider,
      configured: isConfigured(provider, configs[i]),
      tokenTtl: formatTokenTtl(configs[i].tokenTtl),
      settings: summarizeConfig(provider, configs[i]),
    }));

    logger.info(`App: ${clc.bold(appId)} (${platform})`);
    const table = new Table({
      head: ["Provider", "Configured", "Token TTL", "Settings"],
      style: { head: ["green"] },
    });
    for (const row of rows) {
      table.push([
        clc.bold(row.provider),
        formatConfigured(row.configured),
        row.tokenTtl,
        row.settings,
      ]);
    }
    logger.info(table.toString());

    return rows;
  });

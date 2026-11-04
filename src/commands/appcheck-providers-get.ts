import * as clc from "colorette";

import { Command } from "../command";
import { needProjectNumber } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { logger } from "../logger";
import { getProviderConfig } from "../appcheck/api";
import { AppCheckProviderOptions, ProviderConfig, ProviderType } from "../appcheck/types";
import {
  assertProviderSupportsPlatform,
  formatTokenTtl,
  isConfigured,
  parseProviderType,
  providerHelp,
} from "../appcheck/providers";
import { getOrPromptApp } from "./appcheck-prompts";

/** The provider specific lines, in the order a reader expects them. */
function detailLines(provider: ProviderType, config: ProviderConfig): string[] {
  switch (provider) {
    case "device-check":
      return [
        `Key id:        ${config.keyId ?? "not set"}`,
        `Private key:   ${config.privateKeySet ? "set" : "not set"}`,
      ];
    case "recaptcha-enterprise":
      return [
        `Site key:      ${config.siteKey ?? "not set"}`,
        `Min score:     ${config.riskAnalysis?.minValidScore ?? "default"}`,
      ];
    case "recaptcha-v3":
      return [
        `Site secret:   ${config.siteSecretSet ? "set" : "not set"}`,
        `Min score:     ${config.minValidScore ?? "default"}`,
      ];
    case "play-integrity":
      return [
        `Min device:    ${config.deviceIntegrity?.minDeviceRecognitionLevel ?? "default"}`,
        `Licensed:      ${config.accountDetails?.requireLicensed ? "required" : "not required"}`,
        `Unrecognized:  ${config.appIntegrity?.allowUnrecognizedVersion ? "allowed" : "not allowed"}`,
      ];
    default:
      return [];
  }
}

export const command = new Command("appcheck:providers:get <provider>")
  .description("show one App Check attestation provider for an app")
  .help(
    `shows the App Check settings for one attestation provider on one app.

<provider> is one of:

${providerHelp()}

For example:

  \`firebase appcheck:providers:get recaptcha-enterprise --app 1:1234567890:web:abc123\``,
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
  .action(
    async (
      provider: string,
      options: AppCheckProviderOptions,
    ): Promise<ProviderConfig & { provider: ProviderType; configured: boolean | null }> => {
      const providerType = parseProviderType(provider);
      const { appId, platform } = await getOrPromptApp(
        options,
        `Select the app to read ${providerType} settings for:`,
      );
      const projectNumber = await needProjectNumber(options);
      assertProviderSupportsPlatform(providerType, platform, appId);

      const config = await getProviderConfig(projectNumber, appId, providerType);

      logger.info(`Provider:      ${clc.bold(providerType)}`);
      logger.info(`App:           ${appId} (${platform})`);
      for (const line of detailLines(providerType, config)) {
        logger.info(line);
      }
      logger.info(`Token TTL:     ${formatTokenTtl(config.tokenTtl)}`);

      return { ...config, provider: providerType, configured: isConfigured(providerType, config) };
    },
  );

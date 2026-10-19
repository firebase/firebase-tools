import * as clc from "colorette";

import { Command } from "../command";
import { needProjectNumber } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { logger } from "../logger";
import { logSuccess } from "../utils";
import { updateProviderConfig } from "../appcheck/api";
import { AppCheckProviderOptions, ProviderConfig } from "../appcheck/types";
import {
  DEVICE_INTEGRITY_LEVELS,
  assertProviderSupportsPlatform,
  buildProviderUpdate,
  formatTokenTtl,
  parseProviderType,
  providerHelp,
} from "../appcheck/providers";
import { getOrPromptApp } from "./appcheck-prompts";

export const command = new Command("appcheck:providers:set <provider>")
  .description("configure an App Check attestation provider for an app")
  .help(
    `configures one attestation provider for one app.

<provider> is one of:

${providerHelp()}

Flags per provider:

  all                    --token-ttl <30m|1h|1d, between 30m and 7d>
  device-check           --key-id <id> --private-key <value or @file>
  recaptcha-enterprise   --site-key <key> --min-score <0.0-1.0>
  recaptcha-v3           --site-secret <value or @file> --min-score <0.0-1.0>
  play-integrity         --min-device-integrity <${Object.keys(DEVICE_INTEGRITY_LEVELS).join("|")}>
                         --[no-]require-licensed --[no-]allow-unrecognized-version
  app-attest             only --token-ttl

Secrets accept @path to read a file, so a private key does not end up in your shell history.

On iOS and Android, use \`recaptcha-enterprise\` for the reCAPTCHA attestation provider that the mobile SDKs added in June 2026 (Apple 12.15.0, Android firebase-appcheck-recaptcha 19.0.0). It is in public preview there and uses the same site key settings as the web provider.

This command changes how a token is checked, it does not turn enforcement on. Use \`appcheck:services:set\` for that.

For example:

  \`firebase appcheck:providers:set device-check --app 1:123:ios:abc --key-id ABCD1234EF --private-key @AuthKey.p8\``,
  )
  .option("--app <appId>", "the app id of your Firebase app")
  .option("--token-ttl <duration>", "how long App Check tokens stay valid, e.g. 30m, 1h, 1d")
  .option("--key-id <keyId>", "device-check: the Apple key identifier")
  .option("--private-key <value>", "device-check: the .p8 contents, or @path to the file")
  .option("--site-key <siteKey>", "recaptcha-enterprise: the reCAPTCHA Enterprise site key")
  .option("--site-secret <value>", "recaptcha-v3: the site secret, or @path to a file")
  .option("--min-score <score>", "recaptcha: minimum score to accept, 0.0 to 1.0")
  .option(
    "--min-device-integrity <level>",
    `play-integrity: minimum device level (${Object.keys(DEVICE_INTEGRITY_LEVELS).join(", ")})`,
  )
  // Each of these needs its negative form too. Without it a setting can be
  // turned on and never turned off again, since a flag that is absent means
  // "leave it alone" and there would be no way to say "set it to false".
  .option("--require-licensed", "play-integrity: require the LICENSED account verdict")
  .option("--no-require-licensed", "play-integrity: stop requiring the LICENSED verdict")
  .option("--allow-unrecognized-version", "play-integrity: allow unrecognized app versions")
  .option("--no-allow-unrecognized-version", "play-integrity: reject unrecognized app versions")
  .before(requireAuth)
  .before(requirePermissions, [
    "firebaseappcheck.appAttestConfig.update",
    "firebaseappcheck.deviceCheckConfig.update",
    "firebaseappcheck.playIntegrityConfig.update",
    "firebaseappcheck.recaptchaEnterpriseConfig.update",
    "firebaseappcheck.recaptchaV3Config.update",
  ])
  .action(async (provider: string, options: AppCheckProviderOptions): Promise<ProviderConfig> => {
    // Validate the provider and the flags before any network call.
    const providerType = parseProviderType(provider);
    const { update, updateMask } = buildProviderUpdate(providerType, options);

    const { appId, platform } = await getOrPromptApp(
      options,
      `Select the app to configure ${providerType} for:`,
    );
    const projectNumber = await needProjectNumber(options);
    assertProviderSupportsPlatform(providerType, platform, appId);

    const result = await updateProviderConfig(
      projectNumber,
      appId,
      providerType,
      update,
      updateMask,
    );

    logSuccess(`Updated ${clc.bold(providerType)} for app ${clc.bold(appId)}.`);
    if (result.keyId) {
      logger.info(`   Key id:      ${result.keyId}`);
    }
    if (result.privateKeySet) {
      logger.info(`   Private key: set`);
    }
    if (result.siteKey) {
      logger.info(`   Site key:    ${result.siteKey}`);
    }
    if (result.siteSecretSet) {
      logger.info(`   Site secret: set`);
    }
    const minScore = result.riskAnalysis?.minValidScore ?? result.minValidScore;
    if (minScore !== undefined) {
      logger.info(`   Min score:   ${minScore}`);
    }
    if (result.deviceIntegrity?.minDeviceRecognitionLevel) {
      logger.info(`   Min device:  ${result.deviceIntegrity.minDeviceRecognitionLevel}`);
    }
    // These two come back missing rather than false, so `?? false` is what the
    // app really has. Print them for every play-integrity write, otherwise
    // turning one off would answer with nothing at all.
    if (providerType === "play-integrity") {
      const licensed = result.accountDetails?.requireLicensed ?? false;
      const unrecognized = result.appIntegrity?.allowUnrecognizedVersion ?? false;
      logger.info(`   Licensed:    ${licensed ? "required" : "not required"}`);
      logger.info(`   Unrecognized versions: ${unrecognized ? "allowed" : "not allowed"}`);
    }
    logger.info(`   Token TTL:   ${formatTokenTtl(result.tokenTtl)}`);

    return result;
  });

import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { needProjectId } from "../projectUtils";
import * as appcheck from "../gcp/appcheck";
import { listFirebaseApps, AppPlatform } from "../management/apps";
import * as clc from "colorette";
import * as utils from "../utils";
import { FirebaseError } from "../error";

import { Options } from "../options";

/** Reads a command-line flag as a string, or undefined if it was not provided. */
function stringFlag(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export const command = new Command("appcheck:providers:set <appId> <provider>")
  .description(
    "configure an App Check attestation provider (app-attest | device-check | play-integrity | " +
      "recaptcha-enterprise | recaptcha-v3) for an app",
  )
  .option("--site-key <key>", "reCAPTCHA Enterprise site key")
  .option("--site-secret <secret>", "reCAPTCHA v3 site secret (or @path/to/file)")
  .option("--key-id <id>", "Apple DeviceCheck key ID")
  .option("--private-key <key>", "Apple DeviceCheck private key (or @path/to/file)")
  .option("--token-ttl <duration>", "App Check token lifetime, e.g. 1h, 30m, 3600s")
  .before(requirePermissions, ["firebaseappcheck.appCheckConfig.update"])
  .action(async (appId: string, provider: string, options: Options) => {
    const projectId = needProjectId(options);
    const providerType = appcheck.parseProviderType(provider);
    await appcheck.ensureAppCheckApiEnabled(projectId, options);

    // Ensure the provider matches the app's platform.
    const apps = await listFirebaseApps(projectId, AppPlatform.ANY);
    const app = apps.find((a) => a.appId === appId);
    if (!app) {
      throw new FirebaseError(`App ${clc.bold(appId)} was not found in project ${projectId}.`);
    }
    if (!appcheck.providerSupportsPlatform(providerType, app.platform)) {
      const valid = appcheck.providersForPlatform(app.platform);
      const platforms = appcheck.PROVIDER_META[providerType].platforms.join("/");
      throw new FirebaseError(
        `Provider ${clc.bold(providerType)} attests ${platforms} apps, but ` +
          `${appId} is a ${app.platform} app.\n\nValid providers for this app:\n\n` +
          valid.map((p) => `  ${p}`).join("\n"),
      );
    }

    const fields: Record<string, string> = {};

    if (providerType === "recaptcha-enterprise") {
      const siteKey = stringFlag(options.siteKey);
      if (!siteKey) {
        throw new FirebaseError("recaptcha-enterprise requires --site-key.");
      }
      fields.siteKey = siteKey;
    } else if (providerType === "recaptcha-v3") {
      const siteSecret = stringFlag(options.siteSecret);
      if (!siteSecret) {
        throw new FirebaseError("recaptcha-v3 requires --site-secret.");
      }
      fields.siteSecret = appcheck.resolveSecretFlag(siteSecret);
    } else if (providerType === "device-check") {
      const keyId = stringFlag(options.keyId);
      const privateKey = stringFlag(options.privateKey);
      if (!keyId || !privateKey) {
        throw new FirebaseError("device-check requires --key-id and --private-key.");
      }
      fields.keyId = keyId;
      fields.privateKey = appcheck.resolveSecretFlag(privateKey);
    }

    const tokenTtl = stringFlag(options.tokenTtl);
    if (tokenTtl) {
      fields.tokenTtl = appcheck.parseTokenTtl(tokenTtl);
    }

    if (Object.keys(fields).length === 0) {
      throw new FirebaseError(
        `Nothing to configure for ${providerType}. Provide --token-ttl or a provider-specific flag.`,
      );
    }

    const config = await appcheck.setProviderConfig(projectId, appId, providerType, fields);
    utils.logSuccess(`Configured ${clc.bold(providerType)} for app ${clc.bold(appId)}.`);
    return config;
  });

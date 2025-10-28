import * as clc from "colorette";
import * as semver from "semver";

import * as functionsConfig from "../functionsConfig";
import { Command } from "../command";
import { FirebaseError } from "../error";
import { input, confirm } from "../prompt";
import { requirePermissions } from "../requirePermissions";
import { logBullet, logSuccess } from "../utils";
import { requireConfig } from "../requireConfig";
import { ensureValidKey, ensureSecret } from "../functions/secrets";
import { addVersion, listSecretVersions, toSecretVersionResourceName } from "../gcp/secretManager";
import { needProjectId } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { ensureApi } from "../gcp/secretManager";
import { getFunctionsSDKVersion } from "../deploy/functions/runtimes/node/versioning";

import type { Options } from "../options";

const RUNTIME_CONFIG_PERMISSIONS = [
  "runtimeconfig.configs.list",
  "runtimeconfig.configs.get",
  "runtimeconfig.variables.list",
  "runtimeconfig.variables.get",
];

const SECRET_MANAGER_PERMISSIONS = [
  "secretmanager.secrets.create",
  "secretmanager.secrets.get",
  "secretmanager.secrets.update",
  "secretmanager.versions.add",
];

function maskConfigValues(obj: any): any {
  if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
    const masked: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      masked[key] = maskConfigValues(value);
    }
    return masked;
  }
  return "******";
}

export const command = new Command("functions:config:export")
  .description("export environment config as a JSON secret to store in Cloud Secret Manager")
  .option("--secret <name>", "name of the secret to create (default: RUNTIME_CONFIG)")
  .withForce("use default secret name without prompting")
  .before(requireAuth)
  .before(ensureApi)
  .before(requirePermissions, [...RUNTIME_CONFIG_PERMISSIONS, ...SECRET_MANAGER_PERMISSIONS])
  .before(requireConfig)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);

    logBullet(
      "This command retrieves your Runtime Config values (accessed via " +
        clc.bold("functions.config()") +
        ") and exports them as a Secret Manager secret.",
    );
    console.log("");

    logBullet(`Fetching your existing functions.config() from ${clc.bold(projectId)}...`);

    let configJson: Record<string, unknown>;
    try {
      configJson = await functionsConfig.materializeAll(projectId);
    } catch (err: unknown) {
      throw new FirebaseError(
        `Failed to fetch runtime config for project ${projectId}. ` +
          "Ensure you have the required permissions:\n\t" +
          RUNTIME_CONFIG_PERMISSIONS.join("\n\t"),
        { original: err as Error },
      );
    }

    if (Object.keys(configJson).length === 0) {
      logSuccess("Your functions.config() is empty. Nothing to do.");
      return;
    }

    logSuccess("Fetched your existing functions.config().");
    console.log("");

    // Display config in interactive mode
    if (!options.nonInteractive) {
      logBullet(clc.bold("Configuration to be exported:"));
      console.log(JSON.stringify(maskConfigValues(configJson), null, 2));
      console.log("");
    }

    const defaultSecretName = "FUNCTIONS_CONFIG_EXPORT";
    let secretName = options.secret as string;
    if (!secretName) {
      if (options.force) {
        secretName = defaultSecretName;
      } else {
        secretName = await input({
          message: "What would you like to name the new secret for your configuration?",
          default: defaultSecretName,
          nonInteractive: options.nonInteractive,
        });
      }
    }

    const key = await ensureValidKey(secretName, options);
    await ensureSecret(projectId, key, options);

    const versions = await listSecretVersions(projectId, key);
    const enabledVersions = versions.filter((v) => v.state === "ENABLED");
    enabledVersions.sort((a, b) => (b.createTime || "").localeCompare(a.createTime || ""));
    const latest = enabledVersions[0];

    if (latest) {
      logBullet(
        `Secret ${clc.bold(key)} already exists (latest version: ${clc.bold(latest.versionId)}, created: ${latest.createTime}).`,
      );
      const proceed = await confirm({
        message: "Do you want to add a new version to this secret?",
        default: false,
        nonInteractive: options.nonInteractive,
        force: options.force,
      });
      if (!proceed) {
        return;
      }
      console.log("");
    }

    const secretValue = JSON.stringify(configJson, null, 2);

    // Check size limit (64KB)
    const sizeInBytes = Buffer.byteLength(secretValue, "utf8");
    const maxSize = 64 * 1024; // 64KB
    if (sizeInBytes > maxSize) {
      throw new FirebaseError(
        `Configuration size (${sizeInBytes} bytes) exceeds the 64KB limit for JSON secrets. ` +
          "Please reduce the size of your configuration or split it into multiple secrets.",
      );
    }

    const secretVersion = await addVersion(projectId, key, secretValue);
    console.log("");

    logSuccess(`Created new secret version ${toSecretVersionResourceName(secretVersion)}`);
    console.log("");
    logBullet(clc.bold("To complete the migration, update your code:"));
    console.log("");
    console.log(
      clc.gray(`  // Before:
  const functions = require('firebase-functions');

  exports.myFunction = functions.https.onRequest((req, res) => {
    const apiKey = functions.config().service.key;
    // ...
  });

  // After:
  const functions = require('firebase-functions');
  const { defineJsonSecret } = require('firebase-functions/params');

  const config = defineJsonSecret("${key}");

  exports.myFunction = functions
    .runWith({ secrets: [config] })  // Bind secret here
    .https.onRequest((req, res) => {
      const apiKey = config.value().service.key;
      // ...
    });`),
    );
    console.log("");

    // Try to detect the firebase-functions version to see if we need to warn about defineJsonSecret
    let sdkVersion: string | undefined;
    try {
      const functionsConfig = options.config.get("functions");
      const source = Array.isArray(functionsConfig)
        ? functionsConfig[0]?.source
        : functionsConfig?.source;
      if (source) {
        const sourceDir = options.config.path(source);
        sdkVersion = getFunctionsSDKVersion(sourceDir);
      }
    } catch (e) {
      // ignore error, just show the warning if we can't detect the version
    }

    if (!sdkVersion || semver.lt(sdkVersion, "6.6.0")) {
      logBullet(
        clc.bold("Note: ") +
          "defineJsonSecret requires firebase-functions v6.6.0 or later. " +
          "Update your package.json if needed.",
      );
    }
    logBullet("Then deploy your functions:\n  " + clc.bold("firebase deploy --only functions"));

    return secretName;
  });

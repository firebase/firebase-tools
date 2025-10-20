import * as clc from "colorette";

import * as functionsConfig from "../functionsConfig";
import { Command } from "../command";
import { FirebaseError } from "../error";
import { input } from "../prompt";
import { requirePermissions } from "../requirePermissions";
import { logBullet, logWarning, logSuccess } from "../utils";
import { requireConfig } from "../requireConfig";
import { ensureValidKey, ensureSecret } from "../functions/secrets";
import { addVersion, toSecretVersionResourceName } from "../gcp/secretManager";
import { needProjectId } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { ensureApi } from "../gcp/secretManager";

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
      logWarning("This may contain sensitive data. Do not share this output.");
      console.log("");
      console.log(JSON.stringify(configJson, null, 2));
      console.log("");
    }

    const defaultSecretName = "RUNTIME_CONFIG";
    const secretName =
      (options.secret as string) ||
      (await input({
        message: "What would you like to name the new secret for your configuration?",
        default: defaultSecretName,
        nonInteractive: options.nonInteractive,
        force: options.force,
      }));

    const key = await ensureValidKey(secretName, options);
    await ensureSecret(projectId, key, options);

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
    console.log(clc.gray("  // Before:"));
    console.log(clc.gray(`  const functions = require('firebase-functions');`));
    console.log(clc.gray(`  `));
    console.log(clc.gray(`  exports.myFunction = functions.https.onRequest((req, res) => {`));
    console.log(clc.gray(`    const apiKey = functions.config().service.key;`));
    console.log(clc.gray(`    // ...`));
    console.log(clc.gray(`  });`));
    console.log("");
    console.log(clc.gray("  // After:"));
    console.log(clc.gray(`  const functions = require('firebase-functions');`));
    console.log(clc.gray(`  const { defineJsonSecret } = require('firebase-functions/params');`));
    console.log(clc.gray(`  `));
    console.log(clc.gray(`  const config = defineJsonSecret("${key}");`));
    console.log(clc.gray(`  `));
    console.log(clc.gray(`  exports.myFunction = functions`));
    console.log(clc.gray(`    .runWith({ secrets: [config] })  // Bind secret here`));
    console.log(clc.gray(`    .https.onRequest((req, res) => {`));
    console.log(clc.gray(`      const apiKey = config.value().service.key;`));
    console.log(clc.gray(`      // ...`));
    console.log(clc.gray(`    });`));
    console.log("");
    logBullet(
      clc.bold("Note: ") +
        "defineJsonSecret requires firebase-functions v6.6.0 or later. " +
        "Update your package.json if needed.",
    );
    logBullet("Then deploy your functions:\n  " + clc.bold("firebase deploy --only functions"));

    return secretName;
  });

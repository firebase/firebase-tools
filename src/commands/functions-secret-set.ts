import * as fs from "fs";

import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { Options } from "../options";
import { promptOnce } from "../prompt";
import { logSuccess, logWarning } from "../utils";
import { needProjectId } from "../projectUtils";
import {
  addVersion,
  createSecret,
  getSecret,
  Secret,
  toSecretVersionResourceName,
} from "../gcp/secretManager";
import { FirebaseError } from "../error";
import { logError } from "../emulator/auth/utils";
import clc from "cli-color";
import * as utils from "../utils";

export default new Command("functions:secret:set <KEY>")
  .description("Create or update a secret to be used in Cloud Functions for Firebase")
  .withForce("does not upgrade existing secrets to have Firebase manage them.")
  .before(requirePermissions, ["secretmanager.versions.add", "secretmanager.versions.enable"])
  .option(
    "--data-file <dataFile>",
    'File path from which to read secret data. Set to "-" to read the secret data from stdin.'
  )
  .action(async (unvalidatedKey: string, options: Options) => {
    const projectId = needProjectId(options);
    const key = validateKey(unvalidatedKey, options);
    const secret = await ensureSecret(projectId, key, options);

    let secretValue;
    if (options.dataFile) {
      let dataFile: string | number = options.dataFile as string;
      if (dataFile === "-") {
        dataFile = 0;
      }
      secretValue = fs.readFileSync(dataFile, "utf-8");
    } else {
      secretValue = await promptOnce({
        name: key,
        type: "password",
        message: `Enter a value for ${key}`,
      });
    }
    console.log(`Secret: ${secret.name}, value: ${secretValue}`);

    const secretVersion = await addVersion(secret, secretValue);
    logSuccess(`Created a new secret version ${toSecretVersionResourceName(secretVersion)}`);
  });

function validateKey(key: string, options: Options) {
  if (key.toUpperCase() !== key) {
    if (options.force) {
      throw new FirebaseError("Secret key must be in UPPERCASE.");
    }
  }
  logWarning(
    `By convention, secret key must be in UPPERCASE. Using ${key.toUpperCase()} as key instead.`
  );
  return key.toUpperCase();
}

// Check if secret already exists
// If secret already exits...
// .. check if secret is Firebase managed
// .. promopt to have FB manage it.
async function ensureSecret(projectId: string, name: string, options: Options): Promise<Secret> {
  try {
    const secret = await getSecret(projectId, name);
    if (!Object.keys(secret.labels || []).includes("firebase-managed")) {
      if (!options.force) {
        logWarning(
          "Your secret is not managed by Firebase. Firebase managed secrets are automatically pruned to reduce your monthly cost for Secret Manager. "
        );
        const confirm = await promptOnce(
          {
            name: "updateLabels",
            type: "confirm",
            default: true,
            message: `Would you like to have your secret ${secret.name} managed by Firebase?`,
          },
          options
        );
        if (confirm) {
          return utils.reject("Command aborted.", { exit: 1 });
        }
      }
    }
    return secret;
  } catch (err: any) {
    if (err.status !== 404) {
      throw err;
    }
  }
  return await createSecret(projectId, name, { ["firebase-managed"]: "true" });
}

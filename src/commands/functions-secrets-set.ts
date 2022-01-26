import * as clc from "cli-color";
import * as fs from "fs";

import { ensureValidKey, ensureSecret } from "../functions/secrets";
import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { Options } from "../options";
import { promptOnce } from "../prompt";
import { logBullet, logSuccess } from "../utils";
import { needProjectId } from "../projectUtils";
import { addVersion, toSecretVersionResourceName } from "../gcp/secretManager";

export default new Command("functions:secrets:set <KEY>")
  .description("Create or update a secret for use in Cloud Functions for Firebase")
  .withForce(
    "Does not ensure input keys are valid or upgrade existing secrets to have Firebase manage them."
  )
  .before(requirePermissions, [
    "secretmanager.secrets.create",
    "secretmanager.secrets.get",
    "secretmanager.secrets.update",
    "secretmanager.versions.add",
  ])
  .option(
    "--data-file <dataFile>",
    'File path from which to read secret data. Set to "-" to read the secret data from stdin.'
  )
  .action(async (unvalidatedKey: string, options: Options) => {
    const projectId = needProjectId(options);
    const key = ensureValidKey(unvalidatedKey, options);
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

    const secretVersion = await addVersion(secret, secretValue);
    logSuccess(`Created a new secret version ${toSecretVersionResourceName(secretVersion)}`);
    logBullet(
      "Please deploy your functions for the change to take effect by running:\n\t" +
        clc.bold("firebase deploy --only functions")
    );
  });

import * as tty from "tty";
import * as clc from "colorette";
import { join } from "path";

import { Command } from "../command";
import { Options } from "../options";
import { needProjectId, needProjectNumber } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import * as fs from "fs";
import * as gcsm from "../gcp/secretManager";
import * as apphosting from "../gcp/apphosting";
import { requirePermissions } from "../requirePermissions";
import { confirm, promptOnce } from "../prompt";
import * as secrets from "../apphosting/secrets";
import * as dialogs from "../apphosting/secrets/dialogs";
import * as config from "../apphosting/config";
import { logSuccess, logWarning } from "../utils";
import * as yaml from "yaml";

export const command = new Command("apphosting:secrets:set <secretName>")
  .description("grant service accounts permissions to the provided secret")
  .option("-l, --location <location>", "optional location to retrict secret replication")
  // TODO: What is the right --force behavior for granting access? Seems correct to grant permissions
  // if there is only one set of accounts, but should maybe fail if there are more than one set of
  // accounts for different backends?
  .withForce("Automatically create a secret, grant permissions, and add to YAML.")
  .before(requireAuth)
  .before(gcsm.ensureApi)
  .before(apphosting.ensureApiEnabled)
  .before(requirePermissions, [
    "secretmanager.secrets.create",
    "secretmanager.secrets.get",
    "secretmanager.secrets.update",
    "secretmanager.versions.add",
    "secretmanager.secrets.getIamPolicy",
    "secretmanager.secrets.setIamPolicy",
  ])
  .option(
    "--data-file <dataFile>",
    'File path from which to read secret data. Set to "-" to read the secret data from stdin.',
  )
  .action(async (secretName: string, options: Options) => {
    const howToAccess = `You can access the contents of the secret's latest value with ${clc.bold(`firebase apphosting:secrets:access ${secretName}`)}`;
    const grantAccess = `To use this secret in your backend, you must grant access. You can do so in the future with ${clc.bold("firebase apphosting:secrets:grantAccess")}`;
    const projectId = needProjectId(options);
    const projectNumber = await needProjectNumber(options);

    const created = await secrets.upsertSecret(projectId, secretName, options.location as string);
    if (created === null) {
      return;
    }

    let secretValue;
    if ((!options.dataFile || options.dataFile === "-") && tty.isatty(0)) {
      secretValue = await promptOnce({
        type: "password",
        message: `Enter a value for ${secretName}`,
      });
    } else {
      let dataFile: string | number = 0;
      if (options.dataFile && options.dataFile !== "-") {
        dataFile = options.dataFile as string;
      }
      secretValue = fs.readFileSync(dataFile, "utf-8");
    }

    if (created) {
      logSuccess(`Created new secret projects/${projectId}/secrets/${secretName}`);
    }

    const version = await gcsm.addVersion(projectId, secretName, secretValue);
    logSuccess(`Created new secret version ${gcsm.toSecretVersionResourceName(version)}`);
    logSuccess(howToAccess);

    // If the secret already exists, we want to exit once the new version is added
    if (!created) {
      logWarning(grantAccess);
      return;
    }

    const accounts = await dialogs.selectBackendServiceAccounts(projectNumber, projectId, options);

    // If we're not granting permissions, there's no point in adding to YAML either.
    if (!accounts.buildServiceAccounts.length && !accounts.runServiceAccounts.length) {
      logWarning(grantAccess);

      // TODO: For existing secrets, enter the grantSecretAccess dialog only when the necessary permissions don't exist.
    } else {
      await secrets.grantSecretAccess(projectId, secretName, accounts);
    }

    // Note: The API proposal suggested that we would check if the env exists. This is stupidly hard because the YAML may not exist yet.
    let path = config.yamlPath(process.cwd());
    let projectYaml: yaml.Document;
    if (path) {
      projectYaml = config.load(path);
    } else {
      projectYaml = new yaml.Document();
    }
    if (config.getEnv(projectYaml, secretName)) {
      return;
    }
    const addToYaml = await confirm({
      message: "Would you like to add this secret to apphosting.yaml?",
      default: true,
    });
    if (!addToYaml) {
      return;
    }
    if (!path) {
      path = await promptOnce({
        message:
          "It looks like you don't have an apphosting.yaml yet. Where would you like to store it?",
        default: process.cwd(),
      });
      path = join(path, "apphosting.yaml");
    }
    const envName = await dialogs.envVarForSecret(secretName);
    config.setEnv(projectYaml, {
      variable: envName,
      secret: secretName,
    });
    config.store(path, projectYaml);
  });

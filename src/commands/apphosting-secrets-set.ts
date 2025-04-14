import * as clc from "colorette";

import { Command } from "../command";
import { Options } from "../options";
import { needProjectId, needProjectNumber } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import * as gcsm from "../gcp/secretManager";
import * as apphosting from "../gcp/apphosting";
import { requirePermissions } from "../requirePermissions";
import * as secrets from "../apphosting/secrets";
import * as dialogs from "../apphosting/secrets/dialogs";
import * as config from "../apphosting/config";
import * as utils from "../utils";
import * as prompt from "../prompt";

export const command = new Command("apphosting:secrets:set <secretName>")
  .description("create or update a secret for use in Firebase App Hosting")
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
    const projectId = needProjectId(options);
    const projectNumber = await needProjectNumber(options);

    const created = await secrets.upsertSecret(projectId, secretName, options.location as string);
    if (created === null) {
      return;
    } else if (created) {
      utils.logSuccess(`Created new secret projects/${projectId}/secrets/${secretName}`);
    }

    const secretValue = await utils.readSecretValue(
      `Enter a value for ${secretName}`,
      options.dataFile as string | undefined,
    );

    const version = await gcsm.addVersion(projectId, secretName, secretValue);
    utils.logSuccess(`Created new secret version ${gcsm.toSecretVersionResourceName(version)}`);
    utils.logBullet(
      `You can access the contents of the secret's latest value with ${clc.bold(`firebase apphosting:secrets:access ${secretName}\n`)}`,
    );

    // If the secret already exists, we want to exit once the new version is added
    if (!created) {
      return;
    }

    const type = await prompt.promptOnce({
      type: "list",
      name: "type",
      message: "Is this secret for production or only local testing?",
      choices: [
        { name: "Production", value: "production" },
        { name: "Local testing only", value: "local" },
      ],
    });

    if (type === "local") {
      const emailList = await prompt.promptOnce({
        type: "input",
        name: "emails",
        message:
          "Please enter a comma separated list of user or groups who should have access to this secret:",
      });
      if (emailList.length) {
        await secrets.grantEmailsSecretAccess(projectId, [secretName], emailList.split(","));
      } else {
        utils.logBullet(
          "To grant access in the future run " +
            clc.bold(`firebase apphosting:secrets:grantaccess ${secretName} --emails [email list]`),
        );
      }
      await config.maybeAddSecretToYaml(secretName, config.APPHOSTING_EMULATORS_YAML_FILE);
      return;
    }

    const accounts = await dialogs.selectBackendServiceAccounts(projectNumber, projectId, options);

    // If we're not granting permissions, there's no point in adding to YAML either.
    if (!accounts.buildServiceAccounts.length && !accounts.runServiceAccounts.length) {
      utils.logWarning(
        `To use this secret in your backend, you must grant access. You can do so in the future with ${clc.bold("firebase apphosting:secrets:grantaccess")}`,
      );

      // TODO: For existing secrets, enter the grantSecretAccess dialog only when the necessary permissions don't exist.
    } else {
      await secrets.grantSecretAccess(projectId, projectNumber, secretName, accounts);
    }

    await config.maybeAddSecretToYaml(secretName, config.APPHOSTING_BASE_YAML_FILE);
    utils.logBullet(
      "To grant additional users access to this secret run " +
        clc.bold(`firebase apphosting:secrets:grantaccess ${secretName} --email [email list]`) +
        ".\nTo grant additional backends access to this secret run " +
        clc.bold(`firebase apphosting:secrets:grantaccess ${secretName} --backend [backend ID]`),
    );
  });

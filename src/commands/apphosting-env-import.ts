import * as clc from "colorette";

import { Command } from "../command";
import { Options } from "../options";
import { requireAuth } from "../requireAuth";
import { importEnv } from "../apphosting/env";
import { needProjectId, needProjectNumber } from "../projectUtils";
import { fileExistsSync } from "../fsutils";
import { FirebaseError } from "../error";
import { promises as fs } from "fs";
import * as path from "path";
import * as env from "../functions/env";
import * as config from "../apphosting/config";
import * as prompt from "../prompt";
import { requirePermissions } from "../requirePermissions";
import * as gcsm from "../gcp/secretManager";
import * as secrets from "../apphosting/secrets";
import * as dialogs from "../apphosting/secrets/dialogs";
import * as utils from "../utils";

export const command = new Command("apphosting:env:import")
  .description("import environment variables from a .env file into your apphosting.yaml")
  .option("--source <file>", "path to .env file", "")
  .option("--output <file>", "path to apphosting yaml file", "")
  .before(requireAuth)
  .before(gcsm.ensureApi)
  .before(requirePermissions, [
    "secretmanager.secrets.create",
    "secretmanager.secrets.get",
    "secretmanager.secrets.update",
    "secretmanager.versions.add",
    "secretmanager.secrets.getIamPolicy",
    "secretmanager.secrets.setIamPolicy",
  ])
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const projectNumber = await needProjectNumber(options);
    const source = options.source as string;
    let envFilePath: string;
    let projectRoot: string;
    if (source) {
      envFilePath = path.resolve(source);
      projectRoot = path.dirname(envFilePath);
    } else {
      const temp = config.discoverBackendRoot(process.cwd());
      if (!temp) {
        throw new FirebaseError(
          "Could not find .env file. Please specify the path to your .env file with the --source flag.",
        );
      }
      projectRoot = temp;
      envFilePath = path.join(projectRoot, ".env");
    }

    if (!fileExistsSync(envFilePath)) {
      throw new FirebaseError("Could not find .env file. Please specify with the --source flag.");
    }

    const envFileContent = await fs.readFile(envFilePath, "utf8");
    const { envs, errors } = env.parse(envFileContent);

    if (errors.length > 0) {
      throw new FirebaseError(`Invalid .env file: ${errors.join(", ")}`);
    }

    // NOTE: When we add a --backend option, we can use a yaml.Document in memory with the same utilities,
    // but then just publish the values to the server.
    let outputFile = options.output as string;
    if (!outputFile) {
      const environment = await prompt.input(
        "What environment would you like to import to? Leave blank for all environments, use 'emulator' to affect the emulator",
      );
      outputFile = environment ? `apphosting.${environment}.yaml` : "apphosting.yaml";
    }

    if (!path.isAbsolute(outputFile)) {
      outputFile = path.resolve(projectRoot, outputFile);
    }
    const doc = config.load(outputFile);

    const newSecrets = await importEnv(projectId, envs, doc);

    if (outputFile.endsWith(".local.yaml") || outputFile.endsWith(".emulator.yaml")) {
      const emailList = await prompt.input({
        message:
          "Please enter a comma separated list of user or groups who should have access to this secret:",
      });
      if (emailList.length) {
        await secrets.grantEmailsSecretAccess(projectId, newSecrets, emailList.split(","));
      } else {
        utils.logBullet(
          "To grant access in the future run " +
            clc.bold(
              `firebase apphosting:secrets:grantaccess ${newSecrets.join(",")} --emails [email list]`,
            ),
        );
      }
      config.store(outputFile, doc);
      return;
    }

    const accounts = await dialogs.selectBackendServiceAccounts(projectNumber, projectId, options);

    // If we're not granting permissions, there's no point in adding to YAML either.
    if (!accounts.buildServiceAccounts.length && !accounts.runServiceAccounts.length) {
      utils.logWarning(
        `To use this secret in your backend, you must grant access. You can do so in the future with ${clc.bold("firebase apphosting:secrets:grantaccess")}`,
      );
    } else {
      await Promise.all(
        newSecrets.map((secretName) =>
          secrets.grantSecretAccess(projectId, projectNumber, secretName, accounts),
        ),
      );
    }

    config.store(outputFile, doc);
  });

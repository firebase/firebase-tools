import * as _ from "lodash";
import * as clc from "cli-color";
import * as marked from "marked";
import * as ora from "ora";
import TerminalRenderer = require("marked-terminal");

import { populatePostinstall } from "../extensions/populatePostinstall";
import * as askUserForConsent from "../extensions/askUserForConsent";
import * as checkProjectBilling from "../extensions/checkProjectBilling";
import * as Command from "../command";
import { FirebaseError } from "../error";
import { getRandomString } from "../extensions/generateInstanceId";
import * as getProjectId from "../getProjectId";
import { createServiceAccountAndSetRoles } from "../extensions/rolesHelper";
import * as extensionsApi from "../extensions/extensionsApi";
import { resolveSource } from "../extensions/resolveSource";
import * as paramHelper from "../extensions/paramHelper";
import {
  ensureExtensionsApiEnabled,
  getValidInstanceId,
  logPrefix,
  promptForValidInstanceId,
} from "../extensions/extensionsHelper";
import * as requirePermissions from "../requirePermissions";
import * as utils from "../utils";
import * as logger from "../logger";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

interface InstallExtensionOptions {
  paramFilePath?: string;
  projectId: string;
  source: extensionsApi.ExtensionSource;
}

async function installExtension(options: InstallExtensionOptions): Promise<void> {
  const { projectId, source, paramFilePath } = options;
  const spec = source.spec;
  const spinner = ora.default(
    "Installing your extension instance. This usually takes 3 to 5 minutes..."
  );
  try {
    await checkProjectBilling(projectId, spec.displayName || spec.name, spec.billingRequired);
    const roles = spec.roles ? spec.roles.map((role: extensionsApi.Role) => role.role) : [];
    await askUserForConsent.prompt(spec.displayName || spec.name, projectId, roles);

    const params = await paramHelper.getParams(projectId, _.get(spec, "params", []), paramFilePath);

    let instanceId = await getValidInstanceId(projectId, spec.name);
    spinner.start();
    let serviceAccountEmail;
    while (!serviceAccountEmail) {
      try {
        serviceAccountEmail = await createServiceAccountAndSetRoles(
          projectId,
          _.get(spec, "roles", []),
          instanceId
        );
      } catch (err) {
        if (err.status === 409) {
          spinner.stop();
          logger.info(err.message);
          instanceId = await promptForValidInstanceId(`${instanceId}-${getRandomString(4)}`);
          spinner.start();
        } else {
          throw err;
        }
      }
    }
    const response = await extensionsApi.createInstance(
      projectId,
      instanceId,
      source,
      params,
      serviceAccountEmail
    );
    spinner.stop();

    utils.logLabeledSuccess(
      logPrefix,
      `successfully installed ${clc.bold(spec.displayName || spec.name)}, ` +
        `its Instance ID is ${clc.bold(instanceId)}.`
    );
    const usageInstruction =
      _.get(response, "config.populatedPostinstallContent") ||
      populatePostinstall(source.spec.postinstallContent || "", params);
    if (usageInstruction) {
      utils.logLabeledBullet(logPrefix, `usage instructions:\n${marked(usageInstruction)}`);
    } else {
      logger.debug("No usage instructions provided.");
    }
  } catch (err) {
    spinner.fail();
    if (err instanceof FirebaseError) {
      throw err;
    }
    throw new FirebaseError(`Error occurred installing extension: ${err.message}`, {
      original: err,
    });
  }
}

/**
 * Command for installing a extension
 */
export default new Command("ext:install <extensionName>")
  .description("install an extension, given <extensionName> or <extensionName@versionNumber>")
  .option("--params <paramsFile>", "name of params variables file with .env format.")
  .before(requirePermissions, ["firebasemods.instances.create"])
  .before(ensureExtensionsApiEnabled)
  .action(async (extensionName: string, options: any) => {
    try {
      const projectId = getProjectId(options, false);
      const paramFilePath = options.params;
      const sourceUrl = await resolveSource(extensionName);
      const source = await extensionsApi.getSource(sourceUrl);
      return installExtension({
        paramFilePath,
        projectId,
        source,
      });
    } catch (err) {
      if (!(err instanceof FirebaseError)) {
        throw new FirebaseError(`Error occurred installing the extension: ${err.message}`, {
          original: err,
        });
      }
      throw err;
    }
  });

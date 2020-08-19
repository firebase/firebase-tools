import * as _ from "lodash";
import * as clc from "cli-color";
import * as marked from "marked";
import * as ora from "ora";
import TerminalRenderer = require("marked-terminal");

import * as askUserForConsent from "../extensions/askUserForConsent";
import { displayNode10CreateBillingNotice } from "../extensions/billingMigrationHelper";
import { displayExtInstallInfo } from "../extensions/displayExtensionInfo";
import { isBillingEnabled, enableBilling } from "../extensions/checkProjectBilling";
import { Command } from "../command";
import { FirebaseError } from "../error";
import * as getProjectId from "../getProjectId";
import { createServiceAccountAndSetRoles } from "../extensions/rolesHelper";
import * as extensionsApi from "../extensions/extensionsApi";
import {
  promptForAudienceConsent,
  resolveRegistryEntry,
  resolveSourceUrl,
} from "../extensions/resolveSource";
import * as paramHelper from "../extensions/paramHelper";
import {
  instanceIdExists,
  ensureExtensionsApiEnabled,
  createSourceFromLocation,
  logPrefix,
  promptForOfficialExtension,
  promptForRepeatInstance,
  promptForValidInstanceId,
} from "../extensions/extensionsHelper";
import { getRandomString } from "../extensions/utils";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";
import * as logger from "../logger";
import { promptOnce } from "../prompt";
import { previews } from "../previews";

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
    if (spec.billingRequired) {
      const enabled = await isBillingEnabled(projectId);
      if (!enabled) {
        await displayNode10CreateBillingNotice(spec, false);
        await enableBilling(projectId, spec.displayName || spec.name);
      } else {
        await displayNode10CreateBillingNotice(spec, true);
      }
    }
    const roles = spec.roles ? spec.roles.map((role: extensionsApi.Role) => role.role) : [];
    await askUserForConsent.prompt(spec.displayName || spec.name, projectId, roles);

    let instanceId = spec.name;
    const anotherInstanceExists = await instanceIdExists(projectId, instanceId);
    if (anotherInstanceExists) {
      const consent = await promptForRepeatInstance(projectId, spec.name);
      if (!consent) {
        // TODO(b/145233161): Add documentation link about extension instances here.
        logger.info(
          marked(
            "Installation cancelled. For a list of all available Firebase Extensions commands, run `firebase ext`."
          )
        );
        return;
      }
      instanceId = await promptForValidInstanceId(`${instanceId}-${getRandomString(4)}`);
    }
    const params = await paramHelper.getParams(projectId, _.get(spec, "params", []), paramFilePath);

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
    await extensionsApi.createInstance(projectId, instanceId, source, params, serviceAccountEmail);
    spinner.stop();

    utils.logLabeledSuccess(
      logPrefix,
      `Successfully installed your instance of ${clc.bold(spec.displayName || spec.name)}! ` +
        `Its Instance ID is ${clc.bold(instanceId)}.`
    );
    utils.logLabeledBullet(
      logPrefix,
      marked(
        "Go to the Firebase console to view instructions for using your extension, " +
          `which may include some required post-installation tasks: ${utils.consoleUrl(
            projectId,
            `/extensions/instances/${instanceId}?tab=usage`
          )}`
      )
    );
    logger.info(
      marked(
        "You can run `firebase ext` to view available Firebase Extensions commands, " +
          "including those to update, reconfigure, or delete your installed extension."
      )
    );
  } catch (err) {
    if (spinner.isSpinning) {
      spinner.fail();
    }
    if (err instanceof FirebaseError) {
      throw err;
    }
    throw new FirebaseError(`Error occurred installing extension: ${err.message}`, {
      original: err,
    });
  }
}

/**
 * Command for installing an extension
 */
export default new Command("ext:install [extensionName]")
  .description(
    "install an official extension if [extensionName] or [extensionName@version] is provided; " +
      (previews.extdev
        ? "install a local extension if [localPathOrUrl] or [url#root] is provided; "
        : "") +
      "or run with `-i` to see all available extensions."
  )
  .option("--params <paramsFile>", "name of params variables file with .env format.")
  .before(requirePermissions, ["firebaseextensions.instances.create"])
  .before(ensureExtensionsApiEnabled)
  .action(async (extensionName: string, options: any) => {
    const projectId = getProjectId(options, false);
    const paramFilePath = options.params;
    let learnMore = false;
    if (!extensionName) {
      if (options.interactive) {
        learnMore = true;
        extensionName = await promptForOfficialExtension(
          "Which official extension do you wish to install?\n" +
            "  Select an extension, then press Enter to learn more."
        );
      } else {
        throw new FirebaseError(
          `Please provide an extension name, or run ${clc.bold(
            "firebase ext:install -i"
          )} to select from the list of all available official extensions.`
        );
      }
    }

    const [name, version] = extensionName.split("@");
    let source;
    try {
      const registryEntry = await resolveRegistryEntry(name);
      const sourceUrl = resolveSourceUrl(registryEntry, name, version);
      source = await extensionsApi.getSource(sourceUrl);
      displayExtInstallInfo(extensionName, source);
      const audienceConsent = await promptForAudienceConsent(registryEntry);
      if (!audienceConsent) {
        logger.info("Install cancelled.");
        return;
      }
    } catch (err) {
      if (previews.extdev) {
        try {
          source = await createSourceFromLocation(projectId, extensionName);
          displayExtInstallInfo(extensionName, source);
        } catch (err) {
          throw new FirebaseError(
            `Unable to find official extension named ${clc.bold(extensionName)}, ` +
              `and encountered the following error when trying to create an extension from '${clc.bold(
                extensionName
              )}':\n ${err.message}`
          );
        }
      } else {
        throw new FirebaseError(
          `Unable to find offical extension source named ${clc.bold(extensionName)}. ` +
            `Run ${clc.bold(
              "firebase ext:install -i"
            )} to select from the list of all available official extensions.`,
          { original: err }
        );
      }
    }

    try {
      if (learnMore) {
        utils.logLabeledBullet(
          logPrefix,
          `You selected: ${clc.bold(source.spec.displayName)}.\n` +
            `${source.spec.description}\n` +
            `View details: https://firebase.google.com/products/extensions/${name}\n`
        );
        const confirm = await promptOnce({
          type: "confirm",
          default: true,
          message: "Do you wish to install this extension?",
        });
        if (!confirm) {
          return;
        }
      }
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

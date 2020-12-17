import * as _ from "lodash";
import * as clc from "cli-color";
import * as marked from "marked";
import * as ora from "ora";
import TerminalRenderer = require("marked-terminal");

import * as askUserForConsent from "../extensions/askUserForConsent";
import { displayExtInfo } from "../extensions/displayExtensionInfo";
import { displayNode10CreateBillingNotice } from "../extensions/billingMigrationHelper";
import { isBillingEnabled, enableBilling } from "../extensions/checkProjectBilling";
import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { FirebaseError } from "../error";
import * as getProjectId from "../getProjectId";
import * as extensionsApi from "../extensions/extensionsApi";
import {
  promptForAudienceConsent,
  resolveRegistryEntry,
  resolveSourceUrl,
} from "../extensions/resolveSource";
import * as paramHelper from "../extensions/paramHelper";
import {
  confirmInstallInstance,
  createSourceFromLocation,
  ensureExtensionsApiEnabled,
  getSourceOrigin,
  instanceIdExists,
  logPrefix,
  promptForOfficialExtension,
  promptForRepeatInstance,
  promptForValidInstanceId,
  SourceOrigin,
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
  extensionName: string;
  source?: extensionsApi.ExtensionSource;
  extVersion?: extensionsApi.ExtensionVersion;
}

async function installExtension(options: InstallExtensionOptions): Promise<void> {
  const { projectId, extensionName, source, extVersion, paramFilePath } = options;
  const spec = source?.spec || extVersion?.spec;
  if (!spec) {
    throw new FirebaseError(
      `Could not find the extension.yaml for ${extensionName}. Please make sure this is a valid extension and try again.`
    );
  }
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

    if (!source && extVersion) {
      await extensionsApi.createInstanceFromExtensionVersion(
        projectId,
        instanceId,
        extVersion,
        params
      );
    } else if (source) {
      await extensionsApi.createInstanceFromSource(projectId, instanceId, source, params);
    } else {
      throw new FirebaseError(
        `Neither a extension source nor an extension version was supplied for ${extensionName}. Please make sure this is a valid extension and try again.`
      );
    }

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
        ? "install a local extension if [localPathOrUrl] or [url#root] is provided; install a published extension (not authored by Firebase) if [publisherId/extensionId] is provided "
        : "") +
      "or run with `-i` to see all available extensions."
  )
  .option("--params <paramsFile>", "name of params variables file with .env format.")
  .before(requirePermissions, ["firebaseextensions.instances.create"])
  .before(ensureExtensionsApiEnabled)
  .before(checkMinRequiredVersion, "extMinVersion")
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
    let extVersion;
    try {
      const registryEntry = await resolveRegistryEntry(name);
      const sourceUrl = resolveSourceUrl(registryEntry, name, version);
      source = await extensionsApi.getSource(sourceUrl);
      displayExtInfo(extensionName, source.spec, true);
      await confirmInstallInstance();
      const audienceConsent = await promptForAudienceConsent(registryEntry);
      if (!audienceConsent) {
        logger.info("Install cancelled.");
        return;
      }
    } catch (err) {
      if (previews.extdev) {
        const sourceOrigin = await getSourceOrigin(extensionName);
        switch (sourceOrigin) {
          case SourceOrigin.LOCAL || SourceOrigin.URL: {
            try {
              source = await createSourceFromLocation(projectId, extensionName);
            } catch (err) {
              throw new FirebaseError(
                `Unable to find published extension '${clc.bold(extensionName)}', ` +
                  `and encountered the following error when trying to create an instance of extension '${clc.bold(
                    extensionName
                  )}':\n ${err.message}`
              );
            }
            displayExtInfo(extensionName, source.spec);
            await confirmInstallInstance();
            break;
          }
          case SourceOrigin.PUBLISHED_EXTENSION: {
            await extensionsApi.getExtension(extensionName);
            extVersion = await extensionsApi.getExtensionVersion(`${extensionName}@latest`);
            displayExtInfo(extensionName, extVersion.spec, true);
            await confirmInstallInstance();
            break;
          }
          case SourceOrigin.PUBLISHED_EXTENSION_VERSION: {
            extVersion = await extensionsApi.getExtensionVersion(`${extensionName}`);
            displayExtInfo(extensionName, extVersion.spec, true);
            await confirmInstallInstance();
            break;
          }
          default: {
            throw new FirebaseError(
              `Could not determine source origin for extension '${extensionName}'. If this is a published extension, ` +
                "please make sure the publisher and extension exist before trying again. If trying to create an extension, " +
                "please ensure the path or URL given is valid."
            );
          }
        }
      } else {
        throw new FirebaseError(
          `Unable to find published extension '${clc.bold(extensionName)}'. ` +
            `Run ${clc.bold(
              "firebase ext:install -i"
            )} to select from the list of all available published extensions.`,
          { original: err }
        );
      }
    }

    const spec = source?.spec || extVersion?.spec;
    if (!spec) {
      throw new FirebaseError(
        `Could not find the extension.yaml for extension '${clc.bold(
          extensionName
        )}'. Please make sure this is a valid extension and try again.`
      );
    }
    try {
      if (learnMore) {
        utils.logLabeledBullet(
          logPrefix,
          `You selected: ${clc.bold(spec.displayName)}.\n` +
            `${spec.description}\n` +
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
        extensionName,
        source,
        extVersion,
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

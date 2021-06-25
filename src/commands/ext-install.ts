import * as _ from "lodash";
import * as clc from "cli-color";
import * as marked from "marked";
import * as ora from "ora";
import TerminalRenderer = require("marked-terminal");

import * as askUserForConsent from "../extensions/askUserForConsent";
import { displayExtInfo } from "../extensions/displayExtensionInfo";
import { displayNode10CreateBillingNotice } from "../extensions/billingMigrationHelper";
import { enableBilling } from "../extensions/checkProjectBilling";
import { checkBillingEnabled } from "../gcp/cloudbilling";
import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { FirebaseError } from "../error";
import * as getProjectId from "../getProjectId";
import * as extensionsApi from "../extensions/extensionsApi";
import * as provisioningHelper from "../extensions/provisioningHelper";
import { displayWarningPrompts } from "../extensions/warnings";
import * as paramHelper from "../extensions/paramHelper";
import {
  confirmInstallInstance,
  createSourceFromLocation,
  ensureExtensionsApiEnabled,
  instanceIdExists,
  logPrefix,
  promptForOfficialExtension,
  promptForRepeatInstance,
  promptForValidInstanceId,
  isLocalOrURLPath,
} from "../extensions/extensionsHelper";
import { getRandomString } from "../extensions/utils";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";
import { logger } from "../logger";
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
    await provisioningHelper.checkProductsProvisioned(projectId, spec);

    if (spec.billingRequired) {
      const enabled = await checkBillingEnabled(projectId);
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

async function confirmInstallBySource(
  projectId: string,
  extensionName: string
): Promise<extensionsApi.ExtensionSource> {
  // Create a one off source to use for the install flow.
  let source;
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
  displayExtInfo(extensionName, "", source.spec);
  const confirm = await confirmInstallInstance();
  if (!confirm) {
    throw new FirebaseError("Install cancelled.");
  }
  return source;
}

async function confirmInstallByReference(
  extensionName: string
): Promise<extensionsApi.ExtensionVersion> {
  // Infer firebase if publisher ID not provided.
  if (extensionName.split("/").length < 2) {
    const [extensionID, version] = extensionName.split("@");
    extensionName = `firebase/${extensionID}@${version || "latest"}`;
  }
  // Get the correct version for a given extension reference from the Registry API.
  const ref = extensionsApi.parseRef(extensionName);
  const extension = await extensionsApi.getExtension(`${ref.publisherId}/${ref.extensionId}`);
  if (!ref.version) {
    extensionName = `${extensionName}@latest`;
  }
  const extVersion = await extensionsApi.getExtensionVersion(extensionName);
  displayExtInfo(extensionName, ref.publisherId, extVersion.spec, true);
  const confirm = await confirmInstallInstance();
  if (!confirm) {
    throw new FirebaseError("Install cancelled.");
  }
  const warningConsent = await displayWarningPrompts(
    ref.publisherId,
    extension.registryLaunchStage,
    extVersion
  );
  if (!warningConsent) {
    throw new FirebaseError("Install cancelled.");
  }
  return extVersion;
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
          `Unable to find published extension '${clc.bold(extensionName)}'. ` +
            `Run ${clc.bold(
              "firebase ext:install -i"
            )} to select from the list of all available published extensions.`
        );
      }
    }
    let source;
    let extVersion;
    // If the user types in URL, or a local path (prefixed with ~/, ../, or ./), install from local/URL source.
    // Otherwise, treat the input as an extension reference and proceed with reference-based installation.
    if (isLocalOrURLPath(extensionName)) {
      source = await confirmInstallBySource(projectId, extensionName);
    } else {
      extVersion = await confirmInstallByReference(extensionName);
    }
    if (!source && !extVersion) {
      throw new FirebaseError(
        "Could not find a source. Please specify a valid source to continue."
      );
    }
    const spec = source?.spec || extVersion?.spec;
    if (!spec) {
      throw new FirebaseError(
        `Could not find the extension.yaml for extension '${clc.bold(
          extensionName
        )}'. Please make sure this is a valid extension and try again.`
      );
    }
    if (learnMore) {
      utils.logLabeledBullet(
        logPrefix,
        `You selected: ${clc.bold(spec.displayName)}.\n` +
          `${spec.description}\n` +
          `View details: https://firebase.google.com/products/extensions/${spec.name}\n`
      );
      const confirm = await confirmInstallInstance();
      if (!confirm) {
        return;
      }
    }
    try {
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

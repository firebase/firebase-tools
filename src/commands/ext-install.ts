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
import { needProjectId } from "../projectUtils";
import * as extensionsApi from "../extensions/extensionsApi";
import * as provisioningHelper from "../extensions/provisioningHelper";
import { displayWarningPrompts } from "../extensions/warnings";
import * as paramHelper from "../extensions/paramHelper";
import {
  confirm,
  createSourceFromLocation,
  ensureExtensionsApiEnabled,
  instanceIdExists,
  logPrefix,
  promptForOfficialExtension,
  promptForRepeatInstance,
  promptForValidInstanceId,
  isLocalOrURLPath,
} from "../extensions/extensionsHelper";
import { update } from "../extensions/updateHelper";
import { getRandomString } from "../extensions/utils";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";
import { logger } from "../logger";
import { previews } from "../previews";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

interface InstallExtensionOptions {
  paramsEnvPath?: string;
  projectId: string;
  extensionName: string;
  source?: extensionsApi.ExtensionSource;
  extVersion?: extensionsApi.ExtensionVersion;
  nonInteractive: boolean;
  force?: boolean;
}

async function installExtension(options: InstallExtensionOptions): Promise<void> {
  const {
    projectId,
    extensionName,
    source,
    extVersion,
    paramsEnvPath,
    nonInteractive,
    force,
  } = options;
  const spec = source?.spec || extVersion?.spec;
  if (!spec) {
    throw new FirebaseError(
      `Could not find the extension.yaml for ${extensionName}. Please make sure this is a valid extension and try again.`
    );
  }
  const spinner = ora.default();
  try {
    await provisioningHelper.checkProductsProvisioned(projectId, spec);

    if (spec.billingRequired) {
      const enabled = await checkBillingEnabled(projectId);
      if (!enabled && nonInteractive) {
        throw new FirebaseError(
          `This extension requires the Blaze plan, but project ${projectId} is not on the Blaze plan. ` +
            marked(
              "Please visit https://console.cloud.google.com/billing/linkedaccount?project=${projectId} to upgrade your project."
            )
        );
      } else if (!enabled) {
        await displayNode10CreateBillingNotice(spec, false);
        await enableBilling(projectId, spec.displayName || spec.name);
      } else {
        await displayNode10CreateBillingNotice(spec, !nonInteractive);
      }
    }
    const roles = spec.roles ? spec.roles.map((role: extensionsApi.Role) => role.role) : [];
    if (roles.length) {
      await askUserForConsent.displayRoles(spec.displayName || spec.name, projectId, roles);
      const consented = await confirm({ nonInteractive, force, default: true });
      if (!consented) {
        throw new FirebaseError(
          "Without explicit consent for the roles listed, we cannot deploy this extension."
        );
      }
    }
    let instanceId = spec.name;

    let choice: "updateExisting" | "installNew" | "cancel";
    const anotherInstanceExists = await instanceIdExists(projectId, instanceId);
    if (anotherInstanceExists) {
      if (!nonInteractive) {
        choice = await promptForRepeatInstance(projectId, spec.name);
      } else if (nonInteractive && force) {
        choice = "updateExisting";
      } else {
        throw new FirebaseError(
          `An extension with the ID '${clc.bold(
            extensionName
          )}' already exists in the project '${clc.bold(projectId)}'.` +
            ` To update or reconfigure this instance instead, rerun this command with the --force flag.`
        );
      }
    } else {
      choice = "installNew";
    }
    let params: Record<string, string>;
    switch (choice) {
      case "installNew":
        instanceId = await promptForValidInstanceId(`${instanceId}-${getRandomString(4)}`);
        params = await paramHelper.getParams({
          projectId,
          paramSpecs: spec.params,
          nonInteractive,
          paramsEnvPath,
        });
        spinner.text = "Installing your extension instance. This usually takes 3 to 5 minutes...";
        spinner.start();
        await extensionsApi.createInstance({
          projectId,
          instanceId,
          extensionSource: source,
          extensionVersionRef: extVersion?.ref,
          params,
        });
        spinner.stop();
        utils.logLabeledSuccess(
          logPrefix,
          `Successfully installed your instance of ${clc.bold(spec.displayName || spec.name)}! ` +
            `Its Instance ID is ${clc.bold(instanceId)}.`
        );
        break;
      case "updateExisting":
        params = await paramHelper.getParams({
          projectId,
          paramSpecs: spec.params,
          nonInteractive,
          paramsEnvPath,
        });
        spinner.text = "Updating your extension instance. This usually takes 3 to 5 minutes...";
        spinner.start();
        await update({
          projectId,
          instanceId,
          source,
          extRef: extVersion?.ref,
          params,
        });
        spinner.stop();
        utils.logLabeledSuccess(
          logPrefix,
          `Successfully updated your instance of ${clc.bold(spec.displayName || spec.name)}! ` +
            `Its Instance ID is ${clc.bold(instanceId)}.`
        );
        break;
      case "cancel":
        return;
    }
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

async function infoInstallBySource(
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
  return source;
}

async function infoInstallByReference(
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
  displayWarningPrompts(ref.publisherId, extension.registryLaunchStage, extVersion);
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
  .withForce()
  .option("--params <paramsFile>", "name of params variables file with .env format.")
  .before(requirePermissions, ["firebaseextensions.instances.create"])
  .before(ensureExtensionsApiEnabled)
  .before(checkMinRequiredVersion, "extMinVersion")
  .action(async (extensionName: string, options: any) => {
    const projectId = needProjectId(options);
    const paramsEnvPath = options.params;
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
      source = await infoInstallBySource(projectId, extensionName);
    } else {
      extVersion = await infoInstallByReference(extensionName);
    }
    if (
      !(await confirm({
        nonInteractive: options.nonInteractive,
        force: options.force,
        default: true,
      }))
    ) {
      return;
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
    }
    try {
      return installExtension({
        paramsEnvPath,
        projectId,
        extensionName,
        source,
        extVersion,
        nonInteractive: options.nonInteractive,
        force: options.force,
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

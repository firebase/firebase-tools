import * as clc from "cli-color";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const { marked } = require("marked");
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
import { getProjectId, needProjectId } from "../projectUtils";
import * as extensionsApi from "../extensions/extensionsApi";
import * as secretsUtils from "../extensions/secretsUtils";
import * as provisioningHelper from "../extensions/provisioningHelper";
import * as refs from "../extensions/refs";
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
  diagnoseAndFixProject,
  isUrlPath,
} from "../extensions/extensionsHelper";
import { update } from "../extensions/updateHelper";
import { getRandomString } from "../extensions/utils";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";
import { track } from "../track";
import { logger } from "../logger";
import { previews } from "../previews";
import { Options } from "../options";
import * as manifest from "../extensions/manifest";
import { getBaseParamBindings, ParamBindingOptions } from "../extensions/paramHelper";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

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
  // TODO(b/221037520): Deprecate the params flag then remove it in the next breaking version.
  .option("--params <paramsFile>", "name of params variables file with .env format.")
  .option("--local", "save to firebase.json rather than directly install to a Firebase project")
  .before(requirePermissions, ["firebaseextensions.instances.create"])
  .before(ensureExtensionsApiEnabled)
  .before(checkMinRequiredVersion, "extMinVersion")
  .before(diagnoseAndFixProject)
  .action(async (extensionName: string, options: Options) => {
    const projectId = getProjectId(options);
    const paramsEnvPath = (options.params ?? "") as string;
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

    // TODO(b/220900194): Remove tracking of url install once we remove this feature.
    if (isUrlPath(extensionName)) {
      void track("Extension Install", "Install by url path", options.interactive ? 1 : 0);
    }

    // If the user types in URL, or a local path (prefixed with ~/, ../, or ./), install from local/URL source.
    // Otherwise, treat the input as an extension reference and proceed with reference-based installation.
    if (isLocalOrURLPath(extensionName)) {
      void track("Extension Install", "Install by Source", options.interactive ? 1 : 0);
      if (options.local) {
        throw new FirebaseError(
          "Installing a local source locally is not supported yet, please use ext:dev:emulator commands"
        );
      }
      source = await infoInstallBySource(needProjectId({ projectId }), extensionName);
    } else {
      void track("Extension Install", "Install by Extension Ref", options.interactive ? 1 : 0);
      extVersion = await infoInstallByReference(extensionName, options.interactive);
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

    if (options.local) {
      try {
        return installToManifest({
          paramsEnvPath,
          projectId,
          extensionName,
          source,
          extVersion,
          nonInteractive: options.nonInteractive,
          force: options.force,
        });
      } catch (err: any) {
        if (!(err instanceof FirebaseError)) {
          throw new FirebaseError(
            `Error occurred saving the extension to manifest: ${err.message}`,
            {
              original: err,
            }
          );
        }
        throw err;
      }
    }

    // TODO(b/220900194): Remove this and make --local the default behavior.
    try {
      return installExtension({
        paramsEnvPath,
        projectId: projectId,
        extensionName,
        source,
        extVersion,
        nonInteractive: options.nonInteractive,
        force: options.force,
      });
    } catch (err: any) {
      if (!(err instanceof FirebaseError)) {
        throw new FirebaseError(`Error occurred installing the extension: ${err.message}`, {
          original: err,
        });
      }
      throw err;
    }
  });

async function infoInstallBySource(
  projectId: string,
  extensionName: string
): Promise<extensionsApi.ExtensionSource> {
  // Create a one off source to use for the install flow.
  let source;
  try {
    source = await createSourceFromLocation(projectId, extensionName);
  } catch (err: any) {
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
  extensionName: string,
  interactive: boolean
): Promise<extensionsApi.ExtensionVersion> {
  // Infer firebase if publisher ID not provided.
  if (extensionName.split("/").length < 2) {
    const [extensionID, version] = extensionName.split("@");
    extensionName = `firebase/${extensionID}@${version || "latest"}`;
  }
  // Get the correct version for a given extension reference from the Registry API.
  const ref = refs.parse(extensionName);
  const extension = await extensionsApi.getExtension(refs.toExtensionRef(ref));
  if (!ref.version) {
    void track("Extension Install", "Install by Extension Version Ref", interactive ? 1 : 0);
    extensionName = `${extensionName}@latest`;
  }
  const extVersion = await extensionsApi.getExtensionVersion(extensionName);
  displayExtInfo(extensionName, ref.publisherId, extVersion.spec, true);
  await displayWarningPrompts(ref.publisherId, extension.registryLaunchStage, extVersion);
  return extVersion;
}

interface InstallExtensionOptions {
  paramsEnvPath?: string;
  projectId?: string;
  extensionName: string;
  source?: extensionsApi.ExtensionSource;
  extVersion?: extensionsApi.ExtensionVersion;
  nonInteractive: boolean;
  force?: boolean;
}

/**
 * Saves the extension instance config values to the manifest.
 *
 * Requires running `firebase deploy` to install it to the Firebase project.
 * @param options
 */
async function installToManifest(options: InstallExtensionOptions): Promise<void> {
  const { projectId, extensionName, extVersion, paramsEnvPath, nonInteractive, force } = options;
  const spec = extVersion?.spec;
  if (!spec) {
    throw new FirebaseError(
      `Could not find the extension.yaml for ${extensionName}. Please make sure this is a valid extension and try again.`
    );
  }

  const config = manifest.loadConfig(options);

  let instanceId = spec.name;
  while (manifest.instanceExists(instanceId, config)) {
    instanceId = await promptForValidInstanceId(`${spec.name}-${getRandomString(4)}`);
  }

  const paramBindingOptions = await paramHelper.getParams({
    projectId,
    paramSpecs: spec.params,
    nonInteractive,
    paramsEnvPath,
    instanceId,
  });

  const ref = refs.parse(extVersion.ref);
  await manifest.writeToManifest(
    [
      {
        instanceId,
        ref,
        params: paramBindingOptions,
        paramSpecs: spec.params,
      },
    ],
    config,
    { nonInteractive, force: force ?? false }
  );
  manifest.showPreviewWarning();
}

/**
 * Installs the extension in user's project.
 *
 * 1. Checks products are provisioned.
 * 2. Checks billings are enabled if needed.
 * 3. Asks for permission to grant sa roles.
 * 4. Asks for extension params
 * 5. Install
 * @param options
 */
async function installExtension(options: InstallExtensionOptions): Promise<void> {
  const { extensionName, source, extVersion, paramsEnvPath, nonInteractive, force } = options;
  const projectId = needProjectId({ projectId: options.projectId });

  const spec = source?.spec || extVersion?.spec;
  if (!spec) {
    throw new FirebaseError(
      `Could not find the extension.yaml for ${extensionName}. Please make sure this is a valid extension and try again.`
    );
  }
  const spinner = ora();
  try {
    await provisioningHelper.checkProductsProvisioned(projectId, spec);

    const usesSecrets = secretsUtils.usesSecrets(spec);
    if (spec.billingRequired || usesSecrets) {
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
        await enableBilling(projectId);
      } else {
        await displayNode10CreateBillingNotice(spec, !nonInteractive);
      }
    }
    const apis = spec.apis || [];
    if (usesSecrets) {
      apis.push({
        apiName: "secretmanager.googleapis.com",
        reason: `To access and manage secrets which are used by this extension. By using this product you agree to the terms and conditions of the following license: https://console.cloud.google.com/tos?id=cloud&project=${projectId}`,
      });
    }
    if (apis.length) {
      askUserForConsent.displayApis(spec.displayName || spec.name, projectId, apis);
      const consented = await confirm({ nonInteractive, force, default: true });
      if (!consented) {
        throw new FirebaseError(
          "Without explicit consent for the APIs listed, we cannot deploy this extension."
        );
      }
    }
    if (usesSecrets) {
      await secretsUtils.ensureSecretManagerApiEnabled(options);
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
    let paramBindingOptions: { [key: string]: ParamBindingOptions };
    let paramBindings: Record<string, string>;
    switch (choice) {
      case "installNew":
        instanceId = await promptForValidInstanceId(`${instanceId}-${getRandomString(4)}`);
        paramBindingOptions = await paramHelper.getParams({
          projectId,
          paramSpecs: spec.params,
          nonInteractive,
          paramsEnvPath,
          instanceId,
        });
        paramBindings = getBaseParamBindings(paramBindingOptions);
        spinner.text = "Installing your extension instance. This usually takes 3 to 5 minutes...";
        spinner.start();
        await extensionsApi.createInstance({
          projectId,
          instanceId,
          extensionSource: source,
          extensionVersionRef: extVersion?.ref,
          params: paramBindings,
        });
        spinner.stop();
        utils.logLabeledSuccess(
          logPrefix,
          `Successfully installed your instance of ${clc.bold(spec.displayName || spec.name)}! ` +
            `Its Instance ID is ${clc.bold(instanceId)}.`
        );
        break;
      case "updateExisting":
        paramBindingOptions = await paramHelper.getParams({
          projectId,
          paramSpecs: spec.params,
          nonInteractive,
          paramsEnvPath,
          instanceId,
        });
        paramBindings = getBaseParamBindings(paramBindingOptions);
        spinner.text = "Updating your extension instance. This usually takes 3 to 5 minutes...";
        spinner.start();
        await update({
          projectId,
          instanceId,
          source,
          extRef: extVersion?.ref,
          params: paramBindings,
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
    manifest.showDeprecationWarning();
  } catch (err: any) {
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

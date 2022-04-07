import * as clc from "cli-color";
import * as _ from "lodash";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const { marked } = require("marked");
import * as ora from "ora";
import TerminalRenderer = require("marked-terminal");

import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { FirebaseError } from "../error";
import { displayNode10UpdateBillingNotice } from "../extensions/billingMigrationHelper";
import { enableBilling } from "../extensions/checkProjectBilling";
import { checkBillingEnabled } from "../gcp/cloudbilling";
import * as extensionsApi from "../extensions/extensionsApi";
import * as secretsUtils from "../extensions/secretsUtils";
import * as provisioningHelper from "../extensions/provisioningHelper";
import {
  ensureExtensionsApiEnabled,
  logPrefix,
  getSourceOrigin,
  SourceOrigin,
  confirm,
  diagnoseAndFixProject,
  isLocalPath,
} from "../extensions/extensionsHelper";
import * as paramHelper from "../extensions/paramHelper";
import {
  displayChanges,
  update,
  UpdateOptions,
  updateFromLocalSource,
  updateFromUrlSource,
  updateToVersionFromPublisherSource,
  updateFromPublisherSource,
  getExistingSourceOrigin,
  inferUpdateSource,
} from "../extensions/updateHelper";
import * as refs from "../extensions/refs";
import { getProjectId, needProjectId } from "../projectUtils";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";
import { previews } from "../previews";
import * as manifest from "../extensions/manifest";
import { Options } from "../options";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

/**
 * Command for updating an existing extension instance
 */
export default new Command("ext:update <extensionInstanceId> [updateSource]")
  .description(
    previews.extdev
      ? "update an existing extension instance to the latest version or from a local or URL source"
      : "update an existing extension instance to the latest version"
  )
  .before(requirePermissions, [
    "firebaseextensions.instances.update",
    "firebaseextensions.instances.get",
  ])
  .before(ensureExtensionsApiEnabled)
  .before(checkMinRequiredVersion, "extMinVersion")
  .before(diagnoseAndFixProject)
  .withForce()
  .option("--params <paramsFile>", "name of params variables file with .env format.")
  .option(
    "--local",
    "save the update to firebase.json rather than directly update an existing Extension instance on a Firebase project"
  )
  .action(async (instanceId: string, updateSource: string, options: Options) => {
    if (options.local) {
      const projectId = getProjectId(options);
      const config = manifest.loadConfig(options);

      const oldRefOrPath = manifest.getInstanceTarget(instanceId, config);
      if (isLocalPath(oldRefOrPath)) {
        throw new FirebaseError(
          `Updating an extension with local source is not neccessary. ` +
            `Rerun "firebase deploy" or restart the emulator after making changes to your local extension source. ` +
            `If you've edited the extension param spec, you can edit an extension instance's params ` +
            `interactively by running "firebase ext:configure --local {instance-id}"`
        );
      }

      const oldRef = manifest.getInstanceRef(instanceId, config);
      const oldExtensionVersion = await extensionsApi.getExtensionVersion(
        refs.toExtensionVersionRef(oldRef)
      );
      updateSource = inferUpdateSource(updateSource, refs.toExtensionRef(oldRef));

      const newSourceOrigin = getSourceOrigin(updateSource);
      if (
        ![SourceOrigin.PUBLISHED_EXTENSION, SourceOrigin.PUBLISHED_EXTENSION_VERSION].includes(
          newSourceOrigin
        )
      ) {
        throw new FirebaseError(`Only updating to a published extension version is allowed`);
      }

      const newExtensionVersion = await extensionsApi.getExtensionVersion(updateSource);

      if (oldExtensionVersion.ref === newExtensionVersion.ref) {
        utils.logLabeledBullet(
          logPrefix,
          `${clc.bold(instanceId)} is already up to date. Its version is ${clc.bold(
            newExtensionVersion.ref
          )}.`
        );
        return;
      }

      utils.logLabeledBullet(
        logPrefix,
        `Updating ${clc.bold(instanceId)} from version ${clc.bold(
          oldExtensionVersion.ref
        )} to version ${clc.bold(newExtensionVersion.ref)}.`
      );

      if (
        !(await confirm({
          nonInteractive: options.nonInteractive,
          force: options.force,
          default: false,
        }))
      ) {
        utils.logLabeledBullet(logPrefix, "Update aborted.");
        return;
      }

      const oldParamValues = manifest.readInstanceParam({
        instanceId,
        projectDir: config.projectDir,
      });

      const newParamBindingOptions = await paramHelper.getParamsForUpdate({
        spec: oldExtensionVersion.spec,
        newSpec: newExtensionVersion.spec,
        currentParams: oldParamValues,
        projectId,
        paramsEnvPath: (options.params ?? "") as string,
        nonInteractive: options.nonInteractive,
        instanceId,
      });

      await manifest.writeToManifest(
        [
          {
            instanceId,
            ref: refs.parse(newExtensionVersion.ref),
            params: newParamBindingOptions,
            extensionSpec: newExtensionVersion.spec,
            extensionVersion: newExtensionVersion,
          },
        ],
        config,
        {
          nonInteractive: options.nonInteractive,
          force: true, // Skip asking for permission again
        }
      );
      manifest.showPreviewWarning();
      return;
    }

    const spinner = ora(`Updating ${clc.bold(instanceId)}. This usually takes 3 to 5 minutes...`);
    try {
      const projectId = needProjectId(options);
      let existingInstance: extensionsApi.ExtensionInstance;
      try {
        existingInstance = await extensionsApi.getInstance(projectId, instanceId);
      } catch (err: any) {
        if (err.status === 404) {
          throw new FirebaseError(
            `Extension instance '${clc.bold(instanceId)}' not found in project '${clc.bold(
              projectId
            )}'.`
          );
        }
        throw err;
      }
      const existingSpec: extensionsApi.ExtensionSpec = existingInstance.config.source.spec;
      if (existingInstance.config.source.state === "DELETED") {
        throw new FirebaseError(
          `Instance '${clc.bold(
            instanceId
          )}' cannot be updated anymore because the underlying extension was unpublished from Firebase's registry of extensions. Going forward, you will only be able to re-configure or uninstall this instance.`
        );
      }
      const existingParams = existingInstance.config.params;
      const existingSource = existingInstance.config.source.name;

      if (existingInstance.config.extensionRef) {
        // User may provide abbreviated syntax in the update command (for example, providing no update source or just a semver)
        // Decipher the explicit update source from the abbreviated syntax.
        updateSource = inferUpdateSource(updateSource, existingInstance.config.extensionRef);
      }
      let newSourceName: string;
      const existingSourceOrigin = await getExistingSourceOrigin(
        projectId,
        instanceId,
        existingSpec.name,
        existingSource
      );
      const newSourceOrigin = getSourceOrigin(updateSource);
      const validUpdate = isValidUpdate(existingSourceOrigin, newSourceOrigin);
      if (!validUpdate) {
        throw new FirebaseError(
          `Cannot update from a(n) ${existingSourceOrigin} to a(n) ${newSourceOrigin}. Please provide a new source that is a(n) ${existingSourceOrigin} and try again.`
        );
      }
      // TODO: remove "falls through" once producer and registry experience are released
      switch (newSourceOrigin) {
        case SourceOrigin.LOCAL:
          if (previews.extdev) {
            newSourceName = await updateFromLocalSource(
              projectId,
              instanceId,
              updateSource,
              existingSpec
            );
            break;
          }
        // falls through
        // eslint-disable-next-line no-fallthrough
        case SourceOrigin.URL:
          if (previews.extdev) {
            newSourceName = await updateFromUrlSource(
              projectId,
              instanceId,
              updateSource,
              existingSpec
            );
            break;
          }
        case SourceOrigin.PUBLISHED_EXTENSION_VERSION:
          newSourceName = await updateToVersionFromPublisherSource(
            projectId,
            instanceId,
            updateSource,
            existingSpec
          );
          break;
        case SourceOrigin.PUBLISHED_EXTENSION:
          newSourceName = await updateFromPublisherSource(
            projectId,
            instanceId,
            updateSource,
            existingSpec
          );
          break;
        default:
          throw new FirebaseError(`Unknown source '${clc.bold(updateSource)}.'`);
      }

      if (
        !(await confirm({
          nonInteractive: options.nonInteractive,
          force: options.force,
          default: true,
        }))
      ) {
        throw new FirebaseError(`Update cancelled.`);
      }

      // TODO(fix): currently exploiting an oversight in this method call to make calls to both
      // the getExtensionSource endpoint and getExtenionVersion endpoint. Only ExtensionSources
      // are returned by this method, so in the case of a getExtensionVersion call, only overlapping
      // fields like name and ExtensionSpec are surfaced.
      // We should fix this.
      const newSource = await extensionsApi.getSource(newSourceName);
      const newSpec = newSource.spec;

      if (
        ![SourceOrigin.LOCAL, SourceOrigin.URL].includes(newSourceOrigin) &&
        existingSpec.version === newSpec.version
      ) {
        utils.logLabeledBullet(
          logPrefix,
          `${clc.bold(instanceId)} is already up to date. Its version is ${clc.bold(
            existingSpec.version
          )}.`
        );
        const retry = await confirm({
          nonInteractive: options.nonInteractive,
          force: options.force,
          default: false,
        });
        if (!retry) {
          utils.logLabeledBullet(logPrefix, "Update aborted.");
          return;
        }
      }

      await displayChanges({
        spec: existingSpec,
        newSpec: newSpec,
        nonInteractive: options.nonInteractive,
        force: options.force,
      });

      await provisioningHelper.checkProductsProvisioned(projectId, newSpec);

      const usesSecrets = secretsUtils.usesSecrets(newSpec);
      if (newSpec.billingRequired || usesSecrets) {
        const enabled = await checkBillingEnabled(projectId);
        displayNode10UpdateBillingNotice(existingSpec, newSpec);
        if (
          !(await confirm({
            nonInteractive: options.nonInteractive,
            force: options.force,
            default: true,
          }))
        ) {
          throw new FirebaseError("Update cancelled.");
        }
        if (!enabled) {
          if (!options.nonInteractive) {
            await enableBilling(projectId);
          } else {
            throw new FirebaseError(
              "The extension requires your project to be upgraded to the Blaze plan. " +
                "To run this command in non-interactive mode, first upgrade your project: " +
                marked(
                  `https://console.cloud.google.com/billing/linkedaccount?project=${projectId}`
                )
            );
          }
        }
        if (usesSecrets) {
          await secretsUtils.ensureSecretManagerApiEnabled(options);
        }
      }
      // make a copy of existingParams -- they get overridden by paramHelper.getParamsForUpdate
      const oldParamValues = { ...existingParams };
      const newParamBindings = await paramHelper.getParamsForUpdate({
        spec: existingSpec,
        newSpec,
        currentParams: existingParams,
        projectId,
        paramsEnvPath: (options.params ?? "") as string,
        nonInteractive: options.nonInteractive,
        instanceId,
      });
      const newParams = paramHelper.getBaseParamBindings(newParamBindings);

      spinner.start();
      const updateOptions: UpdateOptions = {
        projectId,
        instanceId,
      };
      if (newSourceName.includes("publisher")) {
        updateOptions.extRef = refs.toExtensionVersionRef(refs.parse(newSourceName));
      } else {
        updateOptions.source = newSource;
      }
      if (!_.isEqual(newParams, oldParamValues)) {
        updateOptions.params = newParams;
      }
      await update(updateOptions);
      spinner.stop();
      utils.logLabeledSuccess(logPrefix, `successfully updated ${clc.bold(instanceId)}.`);
      utils.logLabeledBullet(
        logPrefix,
        marked(
          `You can view your updated instance in the Firebase console: ${utils.consoleUrl(
            projectId,
            `/extensions/instances/${instanceId}?tab=usage`
          )}`
        )
      );
      manifest.showDeprecationWarning();
    } catch (err: any) {
      if (spinner.isSpinning) {
        spinner.fail();
      }
      if (!(err instanceof FirebaseError)) {
        throw new FirebaseError(`Error occurred while updating the instance: ${err.message}`, {
          original: err,
        });
      }
      throw err;
    }
  });

function isValidUpdate(existingSourceOrigin: SourceOrigin, newSourceOrigin: SourceOrigin): boolean {
  if (existingSourceOrigin === SourceOrigin.PUBLISHED_EXTENSION) {
    return [SourceOrigin.PUBLISHED_EXTENSION, SourceOrigin.PUBLISHED_EXTENSION_VERSION].includes(
      newSourceOrigin
    );
  } else if (existingSourceOrigin === SourceOrigin.LOCAL) {
    return [SourceOrigin.LOCAL, SourceOrigin.URL].includes(newSourceOrigin);
  }
  return false;
}

import * as clc from "cli-color";
import * as _ from "lodash";
import * as marked from "marked";
import * as ora from "ora";
import TerminalRenderer = require("marked-terminal");

import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { FirebaseError } from "../error";
import { displayNode10UpdateBillingNotice } from "../extensions/billingMigrationHelper";
import { enableBilling } from "../extensions/checkProjectBilling";
import { checkBillingEnabled } from "../gcp/cloudbilling";
import * as extensionsApi from "../extensions/extensionsApi";
import * as provisioningHelper from "../extensions/provisioningHelper";
import {
  ensureExtensionsApiEnabled,
  logPrefix,
  getSourceOrigin,
  SourceOrigin,
  confirm,
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
import { needProjectId } from "../projectUtils";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";
import { previews } from "../previews";

marked.setOptions({
  renderer: new TerminalRenderer(),
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
  .withForce()
  .option("--params <paramsFile>", "name of params variables file with .env format.")
  .action(async (instanceId: string, updateSource: string, options: any) => {
    const spinner = ora.default(
      `Updating ${clc.bold(instanceId)}. This usually takes 3 to 5 minutes...`
    );
    try {
      const projectId = needProjectId(options);
      let existingInstance: extensionsApi.ExtensionInstance;
      try {
        existingInstance = await extensionsApi.getInstance(projectId, instanceId);
      } catch (err) {
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

      if (newSpec.billingRequired) {
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
            await enableBilling(projectId, instanceId);
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
      }
      const newParams = await paramHelper.getParamsForUpdate({
        spec: existingSpec,
        newSpec,
        currentParams: existingParams,
        projectId,
        paramsEnvPath: options.params,
        nonInteractive: options.nonInteractive,
      });
      spinner.start();
      const updateOptions: UpdateOptions = {
        projectId,
        instanceId,
      };
      if (newSourceName.includes("publisher")) {
        const { publisherId, extensionId, version } = extensionsApi.parseExtensionVersionName(
          newSourceName
        );
        updateOptions.extRef = `${publisherId}/${extensionId}@${version}`;
      } else {
        updateOptions.source = newSource;
      }
      if (!_.isEqual(newParams, existingParams)) {
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
    } catch (err) {
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

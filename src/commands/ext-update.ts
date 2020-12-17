import * as clc from "cli-color";
import * as _ from "lodash";
import * as marked from "marked";
import * as ora from "ora";
import TerminalRenderer = require("marked-terminal");
import * as semver from "semver";

import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { FirebaseError } from "../error";
import { displayNode10UpdateBillingNotice } from "../extensions/billingMigrationHelper";
import { isBillingEnabled, enableBilling } from "../extensions/checkProjectBilling";
import * as extensionsApi from "../extensions/extensionsApi";
import {
  ensureExtensionsApiEnabled,
  logPrefix,
  getSourceOrigin,
  SourceOrigin,
} from "../extensions/extensionsHelper";
import * as paramHelper from "../extensions/paramHelper";
import {
  displayChanges,
  update,
  UpdateOptions,
  retryUpdate,
  updateFromLocalSource,
  updateFromUrlSource,
  updateFromRegistry,
  updateToVersionFromRegistry,
  updateToVersionFromPublisherSource,
  updateFromPublisherSource,
  getExistingSourceOrigin,
} from "../extensions/updateHelper";
import * as getProjectId from "../getProjectId";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";
import { previews } from "../previews";
import { displayExtInfo } from "../extensions/displayExtensionInfo";

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
  .action(async (instanceId: string, updateSource: string, options: any) => {
    const spinner = ora.default(
      `Updating ${clc.bold(instanceId)}. This usually takes 3 to 5 minutes...`
    );
    try {
      const projectId = getProjectId(options, false);
      let existingInstance;
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
      const existingSpec: extensionsApi.ExtensionSpec = _.get(
        existingInstance,
        "config.source.spec"
      );
      if (existingInstance.config.source.state === "DELETED") {
        throw new FirebaseError(
          `Instance '${clc.bold(
            instanceId
          )}' cannot be updated anymore because the underlying extension was unpublished from Firebase's registry of extensions. Going forward, you will only be able to re-configure or uninstall this instance.`
        );
      }
      const existingParams = _.get(existingInstance, "config.params");
      const existingSource = _.get(existingInstance, "config.source.name");

      // Infer updateSource if instance is from the registry
      if (existingInstance.config.extensionRef && !updateSource) {
        updateSource = `${existingInstance.config.extensionRef}@latest`;
      } else if (existingInstance.config.extensionRef && semver.valid(updateSource)) {
        updateSource = `${existingInstance.config.extensionRef}@${updateSource}`;
      }

      let newSourceName: string;
      let published = false;

      const existingSourceOrigin = await getExistingSourceOrigin(
        projectId,
        instanceId,
        existingSpec.name,
        existingSource
      );
      const newSourceOrigin = await getSourceOrigin(updateSource);

      // We only allow the following types of updates.
      let validUpdate = false;
      if (existingSourceOrigin === SourceOrigin.OFFICIAL_EXTENSION) {
        if (
          [
            SourceOrigin.LOCAL,
            SourceOrigin.URL,
            SourceOrigin.OFFICIAL_EXTENSION,
            SourceOrigin.OFFICIAL_EXTENSION_VERSION,
          ].includes(newSourceOrigin)
        ) {
          validUpdate = true;
        }
      } else if (existingSourceOrigin === SourceOrigin.PUBLISHED_EXTENSION) {
        if (
          [
            SourceOrigin.LOCAL,
            SourceOrigin.URL,
            SourceOrigin.PUBLISHED_EXTENSION,
            SourceOrigin.PUBLISHED_EXTENSION_VERSION,
          ].includes(newSourceOrigin)
        ) {
          validUpdate = true;
        }
      } else if (
        existingSourceOrigin === SourceOrigin.LOCAL ||
        existingSourceOrigin === SourceOrigin.URL
      ) {
        if ([SourceOrigin.LOCAL, SourceOrigin.URL].includes(newSourceOrigin)) {
          validUpdate = true;
        }
      }
      if (!validUpdate) {
        throw new FirebaseError(
          `Cannot update from a(n) ${existingSourceOrigin} to a(n) ${newSourceOrigin}. Please provide a new source that is a(n) ${existingSourceOrigin} and try again.`
        );
      }

      const isPublished = [
        SourceOrigin.OFFICIAL_EXTENSION,
        SourceOrigin.OFFICIAL_EXTENSION_VERSION,
        SourceOrigin.PUBLISHED_EXTENSION,
        SourceOrigin.PUBLISHED_EXTENSION_VERSION,
      ].includes(newSourceOrigin);
      displayExtInfo(instanceId, existingSpec, isPublished);

      // TODO: remove "falls through" once producer and registry experience are released
      switch (newSourceOrigin) {
        case SourceOrigin.LOCAL:
          if (previews.extdev) {
            newSourceName = await updateFromLocalSource(
              projectId,
              instanceId,
              updateSource,
              existingSpec,
              existingSource
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
              existingSpec,
              existingSource
            );
            break;
          }
        case SourceOrigin.OFFICIAL_EXTENSION_VERSION:
          newSourceName = await updateToVersionFromRegistry(
            projectId,
            instanceId,
            existingSpec,
            existingSource,
            updateSource
          );
          break;
        case SourceOrigin.OFFICIAL_EXTENSION:
          newSourceName = await updateFromRegistry(
            projectId,
            instanceId,
            existingSpec,
            existingSource
          );
          break;
        // falls through
        case SourceOrigin.PUBLISHED_EXTENSION_VERSION:
          if (previews.extdev) {
            newSourceName = await updateToVersionFromPublisherSource(
              projectId,
              instanceId,
              updateSource,
              existingSpec,
              existingSource
            );
            published = true;
            break;
          }
        // falls through
        case SourceOrigin.PUBLISHED_EXTENSION:
          if (previews.extdev) {
            newSourceName = await updateFromPublisherSource(
              projectId,
              instanceId,
              updateSource,
              existingSpec,
              existingSource
            );
            published = true;
            break;
          }
        default:
          throw new FirebaseError(`Unknown source '${clc.bold(updateSource)}.'`);
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
        const retry = await retryUpdate();
        if (!retry) {
          utils.logLabeledBullet(logPrefix, "Update aborted.");
          return;
        }
      }
      await displayChanges(existingSpec, newSpec, published);
      if (newSpec.billingRequired) {
        const enabled = await isBillingEnabled(projectId);
        if (!enabled) {
          await displayNode10UpdateBillingNotice(existingSpec, newSpec, false);
          await enableBilling(projectId, instanceId);
        } else {
          await displayNode10UpdateBillingNotice(existingSpec, newSpec, true);
        }
      }
      const newParams = await paramHelper.promptForNewParams(
        existingSpec,
        newSpec,
        existingParams,
        projectId
      );
      spinner.start();
      const updateOptions: UpdateOptions = {
        projectId,
        instanceId,
        source: newSource,
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

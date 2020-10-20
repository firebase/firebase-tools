import * as clc from "cli-color";
import * as _ from "lodash";
import * as marked from "marked";
import * as ora from "ora";
import TerminalRenderer = require("marked-terminal");

import { Command } from "../command";
import { FirebaseError } from "../error";
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
          return utils.reject(
            `No extension instance ${instanceId} found in project ${projectId}.`,
            {
              exit: 1,
            }
          );
        }
        throw err;
      }
      const existingSpec: extensionsApi.ExtensionSpec = _.get(
        existingInstance,
        "config.source.spec"
      );
      const existingParams = _.get(existingInstance, "config.params");
      const existingSource = _.get(existingInstance, "config.source.name");
      displayExtInfo(instanceId, existingSpec, true);

      let newSourceName: string;
      let published = false;
      const origin = await getSourceOrigin(updateSource);
      // TODO: remove "falls through" once producer and registry experience are released
      switch (origin) {
        case SourceOrigin.LOCAL: {
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
        }
        // eslint-disable-next-line no-fallthrough
        case SourceOrigin.URL: {
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
          // falls through
        }
        // eslint-disable-next-line no-fallthrough
        case SourceOrigin.VERSION: {
          if (previews.extdev) {
            const extRef = _.get(existingInstance, "extensionRef");
            const extVer = _.get(existingInstance, "extensionVersion", "latest");
            if (previews.extdev && extRef) {
              newSourceName = await updateToVersionFromPublisherSource(
                instanceId,
                `${extRef}@${extVer}`,
                existingSpec,
                existingSource
              );
            } else {
              newSourceName = await updateToVersionFromRegistry(
                instanceId,
                existingSpec,
                existingSource,
                updateSource
              );
            }
            break;
          }
          // falls through
        }
        // eslint-disable-next-line no-fallthrough
        case SourceOrigin.PUBLISHED_EXTENSION_VERSION: {
          if (previews.extdev) {
            newSourceName = await updateToVersionFromPublisherSource(
              instanceId,
              updateSource,
              existingSpec,
              existingSource
            );
            published = true;
            break;
          }
          // falls through
        }
        // eslint-disable-next-line no-fallthrough
        case SourceOrigin.PUBLISHED_EXTENSION: {
          if (previews.extdev) {
            newSourceName = await updateFromPublisherSource(
              instanceId,
              updateSource,
              existingSpec,
              existingSource
            );
            published = true;
            break;
          }
          // falls through
        }
        // eslint-disable-next-line no-fallthrough
        case SourceOrigin.OFFICIAL: {
          const extRef = _.get(existingInstance, "extensionRef");
          if (previews.extdev && extRef) {
            newSourceName = await updateFromPublisherSource(
              instanceId,
              extRef,
              existingSpec,
              existingSource
            );
          } else {
            newSourceName = await updateFromRegistry(instanceId, existingSpec, existingSource);
          }
          break;
        }
        default: {
          throw new FirebaseError(`unknown source origin for ${updateSource}`);
        }
      }

      const newSource = await extensionsApi.getSource(newSourceName);
      const newSpec = newSource.spec;
      if (!previews.extdev || !updateSource) {
        if (existingSpec.version === newSpec.version) {
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
      }
      await displayChanges(existingSpec, newSpec, published);
      const newParams = await paramHelper.promptForNewParams(
        existingSpec,
        newSpec,
        existingParams,
        projectId
      );
      const rolesToRemove = _.differenceWith(
        existingSpec.roles,
        _.get(newSpec, "roles", []),
        _.isEqual
      );
      spinner.start();
      const updateOptions: UpdateOptions = {
        projectId,
        instanceId,
        source: newSource,
        rolesToAdd: _.get(newSpec, "roles", []),
        rolesToRemove,
        serviceAccountEmail: existingInstance.serviceAccountEmail,
        billingRequired: newSpec.billingRequired,
      };
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

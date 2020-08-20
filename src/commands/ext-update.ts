import * as clc from "cli-color";
import * as _ from "lodash";
import * as marked from "marked";
import * as ora from "ora";
import { Command } from "../command";
import { FirebaseError } from "../error";
import { displayNode10UpdateBillingNotice } from "../extensions/billingMigrationHelper";
import { isBillingEnabled, enableBilling } from "../extensions/checkProjectBilling";
import * as extensionsApi from "../extensions/extensionsApi";
import {
  ensureExtensionsApiEnabled,
  logPrefix,
  createSourceFromLocation,
  urlRegex,
} from "../extensions/extensionsHelper";
import * as paramHelper from "../extensions/paramHelper";
import * as resolveSource from "../extensions/resolveSource";
import {
  displayChanges,
  update,
  confirmUpdateWarning,
  UpdateOptions,
  retryUpdate,
} from "../extensions/updateHelper";
import * as getProjectId from "../getProjectId";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";
import TerminalRenderer = require("marked-terminal");
import { previews } from "../previews";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

/**
 * Command for updating an existing extension instance
 */
export default new Command("ext:update <extensionInstanceId> [localDirectoryOrUrl]")
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
  .action(async (instanceId: string, directoryOrUrl: string, options: any) => {
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
      const currentSpec: extensionsApi.ExtensionSpec = _.get(
        existingInstance,
        "config.source.spec"
      );
      const currentParams = _.get(existingInstance, "config.params");
      const existingSource = _.get(existingInstance, "config.source.name");

      let source;
      let sourceName;
      if (previews.extdev && directoryOrUrl) {
        try {
          source = await createSourceFromLocation(projectId, directoryOrUrl);
          sourceName = source.name;
        } catch (err) {
          const invalidSourceErr = `Unable to update from the source \`${clc.bold(
            directoryOrUrl
          )}\`. To update this instance, you can either:\n
          - Run \`${clc.bold(
            "firebase ext:update " + instanceId
          )}\` to update from the official source.\n
          - Check your directory path or URL, then run \`${clc.bold(
            "firebase ext:update " + instanceId + " <localDirectoryOrUrl>"
          )}\` to update from a local directory or URL source.`;
          throw new FirebaseError(invalidSourceErr);
        }
        utils.logLabeledBullet(
          logPrefix,
          `Updating ${instanceId} from version ${clc.bold(currentSpec.version)} to ${clc.bold(
            directoryOrUrl
          )} (${clc.bold(source.spec.version)})`
        );
        let msg1;
        let msg2;
        let msg3;
        if (urlRegex.test(directoryOrUrl)) {
          msg1 = "You are updating this extension instance from a URL source.";
          msg2 =
            "All the instance's extension-specific resources and logic will be overwritten to use the source code and files from the URL.";
          msg3 =
            "After updating from a URL source, this instance cannot be updated in the future to use an official source.";
        } else {
          msg1 = "You are updating this extension instance from a local source.";
          msg2 =
            "All the instance's extension-specific resources and logic will be overwritten to use the source code and files from the local directory.";
          msg3 =
            "After updating from a local source, this instance cannot be updated in the future to use an official source.";
        }
        utils.logLabeledBullet(logPrefix, `${clc.bold(msg1)}\n`);
        let updateWarning: resolveSource.UpdateWarning;
        let updatingFromOfficial = false;
        try {
          const registryEntry = await resolveSource.resolveRegistryEntry(currentSpec.name);
          updatingFromOfficial = resolveSource.isOfficialSource(registryEntry, existingSource);
        } catch {
          // If registry entry does not exist, assume local directory or URL extension source.
        }

        if (updatingFromOfficial) {
          updateWarning = {
            from: "",
            description: `${msg2}\n\n${msg3}`,
          };
        } else {
          updateWarning = {
            from: "",
            description: `${msg2}`,
          };
        }

        await confirmUpdateWarning(updateWarning);
      } else {
        // Updating to a version from an official source
        let registryEntry;
        try {
          registryEntry = await resolveSource.resolveRegistryEntry(currentSpec.name);
        } catch (err) {
          // If registry entry does not exist, assume local directory or URL extension source.
          throw new FirebaseError(
            `Unable to update this instance without a local or URL source. To update this instance, run "firebase ext:update ${instanceId} <localDirectoryOrUrl>".`
          );
        }
        const targetVersion = resolveSource.getTargetVersion(registryEntry, "latest");
        utils.logLabeledBullet(
          logPrefix,
          `Updating ${instanceId} from version ${clc.bold(
            currentSpec.version
          )} to version ${clc.bold(targetVersion)}`
        );
        const officialSourceMsg =
          "You are updating this extension instance from an official source.";
        utils.logLabeledBullet(
          logPrefix,
          `${clc.bold(
            officialSourceMsg
          )} \n\n All the instance's extension-specific resources and logic will be overwritten to use the source code and files from the latest released version.\n`
        );
        await resolveSource.promptForUpdateWarnings(
          registryEntry,
          currentSpec.version,
          targetVersion
        );
        sourceName = resolveSource.resolveSourceUrl(registryEntry, currentSpec.name, targetVersion);
      }
      const newSource = await extensionsApi.getSource(sourceName);
      const newSpec = newSource.spec;
      if (!previews.extdev || !directoryOrUrl) {
        if (currentSpec.version === newSpec.version) {
          utils.logLabeledBullet(
            logPrefix,
            `${clc.bold(instanceId)} is already up to date. Its version is ${clc.bold(
              currentSpec.version
            )}.`
          );
          const retry = await retryUpdate();
          if (!retry) {
            utils.logLabeledBullet(logPrefix, "Update aborted.");
            return;
          }
        }
      }
      await displayChanges(currentSpec, newSpec);
      if (newSpec.billingRequired) {
        const enabled = await isBillingEnabled(projectId);
        if (!enabled) {
          await displayNode10UpdateBillingNotice(currentSpec, newSpec, false);
          await enableBilling(projectId, instanceId);
        } else {
          await displayNode10UpdateBillingNotice(currentSpec, newSpec, true);
        }
      }
      const newParams = await paramHelper.promptForNewParams(
        currentSpec,
        newSpec,
        currentParams,
        projectId
      );
      const rolesToRemove = _.differenceWith(
        currentSpec.roles,
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
      };
      if (!_.isEqual(newParams, currentParams)) {
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

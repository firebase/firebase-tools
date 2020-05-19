import * as clc from "cli-color";
import * as _ from "lodash";
import * as marked from "marked";
import * as ora from "ora";
import { Command } from "../command";
import { FirebaseError } from "../error";
import * as extensionsApi from "../extensions/extensionsApi";
import { ensureExtensionsApiEnabled, logPrefix } from "../extensions/extensionsHelper";
import * as paramHelper from "../extensions/paramHelper";
import * as resolveSource from "../extensions/resolveSource";
import { displayChanges, update, UpdateOptions } from "../extensions/updateHelper";
import * as getProjectId from "../getProjectId";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";
import TerminalRenderer = require("marked-terminal");

marked.setOptions({
  renderer: new TerminalRenderer(),
});

/**
 * Command for updating an existing extension instance
 */
export default new Command("ext:update <extensionInstanceId>")
  .description("update an existing extension instance to the latest version")
  .before(requirePermissions, [
    "firebaseextensions.instances.update",
    "firebaseextensions.instances.get",
  ])
  .before(ensureExtensionsApiEnabled)
  .action(async (instanceId: string, options: any) => {
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

      const registryEntry = await resolveSource.resolveRegistryEntry(currentSpec.name);
      // TODO: replace with targeted error messaging once multiple source origins are supported.
      if (!resolveSource.isOfficialSource(registryEntry, existingSource)) {
        throw new FirebaseError(`Expected official extension source, but got: ${existingSource}`);
      }

      const targetVersion = resolveSource.getTargetVersion(registryEntry, "latest");
      utils.logLabeledBullet(
        logPrefix,
        `Updating ${instanceId} from version ${clc.bold(currentSpec.version)} to version ${clc.bold(
          targetVersion
        )}`
      );
      await resolveSource.promptForUpdateWarnings(
        registryEntry,
        currentSpec.version,
        targetVersion
      );
      const sourceUrl = resolveSource.resolveSourceUrl(
        registryEntry,
        currentSpec.name,
        targetVersion
      );
      const newSource = await extensionsApi.getSource(sourceUrl);
      const newSpec = newSource.spec;
      if (currentSpec.version === newSpec.version) {
        utils.logLabeledBullet(
          logPrefix,
          `${clc.bold(instanceId)} is already up to date. Its version is ${clc.bold(
            currentSpec.version
          )}.`
        );
        return;
      }
      await displayChanges(currentSpec, newSpec);
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
        billingRequired: newSpec.billingRequired,
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

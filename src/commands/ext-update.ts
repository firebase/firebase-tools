import * as _ from "lodash";
import * as clc from "cli-color";
import * as marked from "marked";
import * as ora from "ora";
import TerminalRenderer = require("marked-terminal");

import * as Command from "../command";
import { FirebaseError } from "../error";
import * as getProjectId from "../getProjectId";
import { resolveSource } from "../extensions/resolveSource";
import * as modsApi from "../extensions/modsApi";
import { ensureModsApiEnabled, logPrefix } from "../extensions/modsHelper";
import * as paramHelper from "../extensions/paramHelper";
import { displayChanges, update } from "../extensions/updateHelper";
import * as requirePermissions from "../requirePermissions";
import * as utils from "../utils";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

/**
 * Command for updating an existing mod instance
 */
export default new Command("ext:update <instanceId>")
  .description("update an existing extension instance to the latest version")
  .before(requirePermissions, [
    // this doesn't exist yet, uncomment when it does
    // "firebasemods.instances.update"
    // "firebasemods.instances.get"
  ])
  .before(ensureModsApiEnabled)
  .action(async (instanceId: string, options: any) => {
    const spinner = ora.default(
      `Updating ${clc.bold(instanceId)}. This usually takes 3 to 5 minutes...`
    );
    try {
      const projectId = getProjectId(options, false);
      let existingInstance;
      try {
        existingInstance = await modsApi.getInstance(projectId, instanceId);
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
      const currentSpec: modsApi.ModSpec = _.get(existingInstance, "configuration.source.spec");
      const currentParams = _.get(existingInstance, "configuration.params");
      const sourceUrl = await resolveSource(currentSpec.name);
      const newSource = await modsApi.getSource(sourceUrl);
      const newSpec = newSource.spec;
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
      await update({
        projectId,
        instanceId,
        source: newSource,
        params: newParams,
        rolesToAdd: _.get(newSpec, "roles", []),
        rolesToRemove,
        serviceAccountEmail: existingInstance.serviceAccountEmail,
        billingRequired: newSpec.billingRequired,
      });
      spinner.stop();
      utils.logLabeledSuccess(logPrefix, `successfully updated ${clc.bold(instanceId)}.`);
    } catch (err) {
      spinner.fail();
      if (!(err instanceof FirebaseError)) {
        throw new FirebaseError(`Error occurred while updating the instance: ${err.message}`, {
          original: err,
        });
      }
      throw err;
    }
  });

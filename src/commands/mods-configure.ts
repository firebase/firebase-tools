import * as _ from "lodash";
import * as clc from "cli-color";
import * as marked from "marked";
import * as ora from "ora";
import TerminalRenderer = require("marked-terminal");

import * as Command from "../command";
import { FirebaseError } from "../error";
import * as getProjectId from "../getProjectId";
import * as modsApi from "../mods/modsApi";
import { logPrefix } from "../mods/modsHelper";
import * as paramHelper from "../mods/paramHelper";
import * as requirePermissions from "../requirePermissions";
import * as utils from "../utils";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

/**
 * Command for configuring an existing mod instance
 */
export default new Command("mods:configure <instanceId>")
  .description("configure an existing mod instance")
  .option("--params <paramsFile>", "path of params file with .env format.")
  .before(requirePermissions, [
    // this doesn't exist yet, uncomment when it does
    // "firebasemods.instances.update"
    // "firebasemods.instances.get"
  ])
  .action(async (instanceId: string, options: any) => {
    const spinner = ora.default(
      `Configuring ${clc.bold(instanceId)}. This usually takes 3 to 5 minutes...`
    );
    try {
      const projectId = getProjectId(options, false);
      let existingInstance;
      try {
        existingInstance = await modsApi.getInstance(projectId, instanceId);
      } catch (err) {
        if (err.status === 404) {
          return utils.reject(`No mod instance ${instanceId} found in project ${projectId}.`, {
            exit: 1,
          });
        }
        throw err;
      }
      const paramSpecWithNewDefaults = paramHelper.getParamsWithCurrentValuesAsDefaults(
        existingInstance
      );
      const removedLocations = _.remove(paramSpecWithNewDefaults, (param) => {
        return param.param === "LOCATION";
      });
      const currentLocation = _.get(existingInstance, "configuration.params.LOCATION");
      const params = await paramHelper.getParams(
        projectId,
        paramSpecWithNewDefaults,
        options.params
      );
      if (removedLocations.length) {
        params.LOCATION = currentLocation;
      }

      spinner.start();
      const res = await modsApi.configureInstance(projectId, instanceId, params);
      spinner.stop();
      utils.logLabeledSuccess(logPrefix, `successfully configured ${clc.bold(instanceId)}.`);
      return res;
    } catch (err) {
      spinner.fail();
      if (!(err instanceof FirebaseError)) {
        throw new FirebaseError(`Error occurred while configuring the instance: ${err.message}`, {
          original: err,
        });
      }
      throw err;
    }
  });

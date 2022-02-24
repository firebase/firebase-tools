import * as _ from "lodash";
import * as clc from "cli-color";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const { marked } = require("marked");
import * as ora from "ora";
import TerminalRenderer = require("marked-terminal");

import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { FirebaseError } from "../error";
import { needProjectId } from "../projectUtils";
import * as extensionsApi from "../extensions/extensionsApi";
import { logPrefix, diagnoseAndFixProject } from "../extensions/extensionsHelper";
import * as paramHelper from "../extensions/paramHelper";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";
import { logger } from "../logger";
import * as refs from "../extensions/refs";
import * as manifest from "../extensions/manifest";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

/**
 * Command for configuring an existing extension instance
 */
export default new Command("ext:configure <extensionInstanceId>")
  .description("configure an existing extension instance")
  .withForce()
  .option("--params <paramsFile>", "path of params file with .env format.")
  .option("--local", "save to firebase.json rather than directly install to a Firebase project")
  .before(requirePermissions, [
    "firebaseextensions.instances.update",
    "firebaseextensions.instances.get",
  ])
  .before(checkMinRequiredVersion, "extMinVersion")
  .before(diagnoseAndFixProject)
  .action(async (instanceId: string, options: any) => {
    const projectId = needProjectId(options);

    if (options.local) {
      const config = manifest.loadConfig(options);
      const targetRef = manifest.getInstanceRef(instanceId, config);
      const extVer = await extensionsApi.getExtensionVersion(refs.toExtensionVersionRef(targetRef));

      const oldParamsValues = manifest.getInstanceParams(instanceId, config);
      const newParams = _.cloneDeep(extVer.spec.params);

      paramHelper.setNewDefaults(newParams, oldParamsValues);

      const immutableParams = _.remove(newParams, (param) => param.immutable);
      infoImmutableParams(immutableParams, oldParamsValues);

      // Ask for mutable param values from user.
      const mutableParamsValues = await paramHelper.getParams({
        projectId,
        paramSpecs: newParams,
        nonInteractive: options.nonInteractive,
        paramsEnvPath: options.params,
        instanceId,
        reconfiguring: true,
      });
      const newParamsValues = {
        ...oldParamsValues,
        ...mutableParamsValues,
      };
      console.log(newParamsValues);
      return;
    }

    const spinner = ora(
      `Configuring ${clc.bold(instanceId)}. This usually takes 3 to 5 minutes...`
    );
    try {
      let existingInstance: extensionsApi.ExtensionInstance;
      try {
        existingInstance = await extensionsApi.getInstance(projectId, instanceId);
      } catch (err: any) {
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
      const paramSpecWithNewDefaults =
        paramHelper.getParamsWithCurrentValuesAsDefaults(existingInstance);
      const immutableParams = _.remove(paramSpecWithNewDefaults, (param) => param.immutable);

      const params = await paramHelper.getParams({
        projectId,
        paramSpecs: paramSpecWithNewDefaults,
        nonInteractive: options.nonInteractive,
        paramsEnvPath: options.params,
        instanceId,
        reconfiguring: true,
      });
      if (immutableParams.length) {
        const plural = immutableParams.length > 1;
        logger.info(`The following param${plural ? "s are" : " is"} immutable:`);
        for (const { param } of immutableParams) {
          const value = _.get(existingInstance, `config.params.${param}`);
          logger.info(`param: ${param}, value: ${value}`);
          params[param] = value;
        }
        logger.info(
          (plural
            ? "To set different values for these params"
            : "To set a different value for this param") +
            ", uninstall the extension, then install a new instance of this extension."
        );
      }

      spinner.start();
      const res = await extensionsApi.configureInstance({ projectId, instanceId, params });
      spinner.stop();
      utils.logLabeledSuccess(logPrefix, `successfully configured ${clc.bold(instanceId)}.`);
      utils.logLabeledBullet(
        logPrefix,
        marked(
          `You can view your reconfigured instance in the Firebase console: ${utils.consoleUrl(
            projectId,
            `/extensions/instances/${instanceId}?tab=config`
          )}`
        )
      );
      return res;
    } catch (err: any) {
      if (spinner.isSpinning) {
        spinner.fail();
      }
      if (!(err instanceof FirebaseError)) {
        throw new FirebaseError(`Error occurred while configuring the instance: ${err.message}`, {
          original: err,
        });
      }
      throw err;
    }
  });

function infoImmutableParams(
  immutableParams: extensionsApi.Param[],
  paramValues: { [key: string]: string }
) {
  if (!immutableParams.length) {
    return;
  }

  const plural = immutableParams.length > 1;
  logger.info(`The following param${plural ? "s are" : " is"} immutable:`);

  for (const { param } of immutableParams) {
    logger.info(`param: ${param}, value: ${paramValues[param]}`);
  }

  logger.info(
    (plural
      ? "To set different values for these params"
      : "To set a different value for this param") +
      ", uninstall the extension, then install a new instance of this extension."
  );
}

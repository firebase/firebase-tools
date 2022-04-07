import * as _ from "lodash";
import * as clc from "cli-color";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const { marked } = require("marked");
import * as ora from "ora";
import TerminalRenderer = require("marked-terminal");

import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { FirebaseError } from "../error";
import { needProjectId, getProjectId } from "../projectUtils";
import * as extensionsApi from "../extensions/extensionsApi";
import {
  logPrefix,
  diagnoseAndFixProject,
  createSourceFromLocation,
  isLocalPath,
} from "../extensions/extensionsHelper";
import * as paramHelper from "../extensions/paramHelper";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";
import { logger } from "../logger";
import * as refs from "../extensions/refs";
import * as manifest from "../extensions/manifest";
import { Options } from "../options";
import { partition } from "../functional";
import { buildBindingOptionsWithBaseValue, getBaseParamBindings } from "../extensions/paramHelper";

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
  .action(async (instanceId: string, options: Options) => {
    const projectId = getProjectId(options);

    if (options.local) {
      if (options.nonInteractive) {
        throw new FirebaseError(
          `Command not supported in non-interactive mode, edit ./extensions/${instanceId}.env directly instead`
        );
      }

      const config = manifest.loadConfig(options);

      const refOrPath = manifest.getInstanceTarget(instanceId, config);
      const isLocalSource = isLocalPath(refOrPath);

      let spec: extensionsApi.ExtensionSpec;
      if (isLocalSource) {
        const source = await createSourceFromLocation(needProjectId({ projectId }), refOrPath);
        spec = source.spec;
      } else {
        const extensionVersion = await extensionsApi.getExtensionVersion(refOrPath);
        spec = extensionVersion.spec;
      }

      const oldParamValues = manifest.readInstanceParam({
        instanceId,
        projectDir: config.projectDir,
      });

      const [immutableParams, tbdParams] = partition(
        spec.params,
        (param) => param.immutable ?? false
      );
      infoImmutableParams(immutableParams, oldParamValues);

      // Ask for mutable param values from user.
      paramHelper.setNewDefaults(tbdParams, oldParamValues);
      const mutableParamsBindingOptions = await paramHelper.getParams({
        projectId,
        paramSpecs: tbdParams,
        nonInteractive: false,
        paramsEnvPath: (options.params ?? "") as string,
        instanceId,
        reconfiguring: true,
      });

      // Merge with old immutable params.
      const newParamOptions = {
        ...buildBindingOptionsWithBaseValue(oldParamValues),
        ...mutableParamsBindingOptions,
      };

      await manifest.writeToManifest(
        [
          {
            instanceId,
            ref: !isLocalSource ? refs.parse(refOrPath) : undefined,
            localPath: isLocalSource ? refOrPath : undefined,
            params: newParamOptions,
            extensionSpec: spec,
          },
        ],
        config,
        {
          nonInteractive: false,
          force: true, // Skip asking for permission again
        }
      );
      manifest.showPreviewWarning();
      return;
    }

    // TODO(b/220900194): Remove everything below and make --local the default behavior.
    const spinner = ora(
      `Configuring ${clc.bold(instanceId)}. This usually takes 3 to 5 minutes...`
    );
    try {
      let existingInstance: extensionsApi.ExtensionInstance;
      try {
        existingInstance = await extensionsApi.getInstance(
          needProjectId({ projectId }),
          instanceId
        );
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

      const paramBindingOptions = await paramHelper.getParams({
        projectId,
        paramSpecs: paramSpecWithNewDefaults,
        nonInteractive: options.nonInteractive,
        paramsEnvPath: options.params as string,
        instanceId,
        reconfiguring: true,
      });
      const paramBindings = getBaseParamBindings(paramBindingOptions);
      if (immutableParams.length) {
        const plural = immutableParams.length > 1;
        logger.info(`The following param${plural ? "s are" : " is"} immutable:`);
        for (const { param } of immutableParams) {
          const value = _.get(existingInstance, `config.params.${param}`);
          logger.info(`param: ${param}, value: ${value}`);
          paramBindings[param] = value;
        }
        logger.info(
          (plural
            ? "To set different values for these params"
            : "To set a different value for this param") +
            ", uninstall the extension, then install a new instance of this extension."
        );
      }

      spinner.start();
      const res = await extensionsApi.configureInstance({
        projectId: needProjectId({ projectId }),
        instanceId,
        params: paramBindings,
      });
      spinner.stop();
      utils.logLabeledSuccess(logPrefix, `successfully configured ${clc.bold(instanceId)}.`);
      utils.logLabeledBullet(
        logPrefix,
        marked(
          `You can view your reconfigured instance in the Firebase console: ${utils.consoleUrl(
            needProjectId({ projectId }),
            `/extensions/instances/${instanceId}?tab=config`
          )}`
        )
      );
      manifest.showDeprecationWarning();
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
  utils.logLabeledWarning(
    logPrefix,
    marked(`The following param${plural ? "s are" : " is"} immutable and won't be changed:`)
  );

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

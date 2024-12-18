import { checkMinRequiredVersion } from "../checkMinRequiredVersion.js";
import { Command } from "../command.js";
import { FirebaseError } from "../error.js";
import { needProjectId, getProjectId } from "../projectUtils.js";
import * as extensionsApi from "../extensions/extensionsApi.js";
import { ExtensionSpec, Param } from "../extensions/types.js";
import {
  logPrefix,
  diagnoseAndFixProject,
  createSourceFromLocation,
  isLocalPath,
} from "../extensions/extensionsHelper.js";
import * as paramHelper from "../extensions/paramHelper.js";
import { requirePermissions } from "../requirePermissions.js";
import * as utils from "../utils.js";
import { logger } from "../logger.js";
import * as refs from "../extensions/refs.js";
import * as manifest from "../extensions/manifest.js";
import { Options } from "../options.js";
import { partition } from "../functional.js";
import { buildBindingOptionsWithBaseValue } from "../extensions/paramHelper.js";
import * as askUserForEventsConfig from "../extensions/askUserForEventsConfig.js";
import { displayDeveloperTOSWarning } from "../extensions/tos.js";

/**
 * Command for configuring an existing extension instance
 */
export const command = new Command("ext:configure <extensionInstanceId>")
  .description("configure an existing extension instance")
  .withForce()
  .option("--local", "deprecated")
  .before(requirePermissions, [
    "firebaseextensions.instances.update",
    "firebaseextensions.instances.get",
  ])
  .before(checkMinRequiredVersion, "extMinVersion")
  .before(diagnoseAndFixProject)
  .action(async (instanceId: string, options: Options) => {
    const projectId = getProjectId(options);

    if (options.nonInteractive) {
      throw new FirebaseError(
        `Command not supported in non-interactive mode, edit ./extensions/${instanceId}.env directly instead. ` +
          `See https://firebase.google.com/docs/extensions/manifest for more details.`,
      );
    }
    if (options.local) {
      utils.logLabeledWarning(
        logPrefix,
        "As of firebase-tools@11.0.0, the `--local` flag is no longer required, as it is the default behavior.",
      );
    }

    const config = manifest.loadConfig(options);

    const refOrPath = manifest.getInstanceTarget(instanceId, config);
    const isLocalSource = isLocalPath(refOrPath);

    let spec: ExtensionSpec;
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
    const params = (spec.params ?? []).concat(spec.systemParams ?? []);
    const [immutableParams, tbdParams] = partition(
      params,
      (param) => (param.immutable && !!oldParamValues[param.param]) ?? false,
    );
    infoImmutableParams(immutableParams, oldParamValues);

    // Ask for mutable param values from user.
    paramHelper.setNewDefaults(tbdParams, oldParamValues);
    const mutableParamsBindingOptions = await paramHelper.getParams({
      projectId,
      paramSpecs: tbdParams,
      nonInteractive: false,
      instanceId,
      reconfiguring: true,
    });

    // Ask for events config
    const eventsConfig = spec.events
      ? await askUserForEventsConfig.askForEventsConfig(
          spec.events,
          "${param:PROJECT_ID}",
          instanceId,
        )
      : undefined;
    if (eventsConfig) {
      mutableParamsBindingOptions.EVENTARC_CHANNEL = { baseValue: eventsConfig.channel };
      mutableParamsBindingOptions.ALLOWED_EVENT_TYPES = {
        baseValue: eventsConfig.allowedEventTypes.join(","),
      };
    }

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
      },
    );
    displayDeveloperTOSWarning();
    return;
  });

function infoImmutableParams(immutableParams: Param[], paramValues: { [key: string]: string }) {
  if (!immutableParams.length) {
    return;
  }

  const plural = immutableParams.length > 1;
  utils.logLabeledWarning(
    logPrefix,
    `The following param${plural ? "s are" : " is"} immutable and won't be changed:`,
  );

  for (const { param } of immutableParams) {
    logger.info(`param: ${param}, value: ${paramValues[param]}`);
  }

  logger.info(
    (plural
      ? "To set different values for these params"
      : "To set a different value for this param") +
      ", uninstall the extension, then install a new instance of this extension.",
  );
}

import * as clc from "colorette";

import { checkMinRequiredVersion } from "../checkMinRequiredVersion.js";
import { Command } from "../command.js";
import { FirebaseError } from "../error.js";
import * as extensionsApi from "../extensions/extensionsApi.js";
import {
  ensureExtensionsApiEnabled,
  logPrefix,
  getSourceOrigin,
  SourceOrigin,
  diagnoseAndFixProject,
  isLocalPath,
} from "../extensions/extensionsHelper.js";
import * as paramHelper from "../extensions/paramHelper.js";
import { inferUpdateSource } from "../extensions/updateHelper.js";
import * as secretsUtils from "../extensions/secretsUtils.js";
import * as refs from "../extensions/refs.js";
import { getProjectId } from "../projectUtils.js";
import { requirePermissions } from "../requirePermissions.js";
import * as utils from "../utils.js";
import { confirm } from "../prompt.js";
import * as manifest from "../extensions/manifest.js";
import { Options } from "../options.js";
import * as askUserForEventsConfig from "../extensions/askUserForEventsConfig.js";
import { displayDeveloperTOSWarning } from "../extensions/tos.js";

/**
 * Command for updating an existing extension instance
 */
export const command = new Command("ext:update <extensionInstanceId> [updateSource]")
  .description(
    "update an existing extension instance to the latest version, or to a specific version if provided",
  )
  .before(requirePermissions, [
    "firebaseextensions.instances.update",
    "firebaseextensions.instances.get",
  ])
  .before(ensureExtensionsApiEnabled)
  .before(checkMinRequiredVersion, "extMinVersion")
  .before(diagnoseAndFixProject)
  .withForce()
  .action(async (instanceId: string, updateSource: string, options: Options) => {
    const projectId = getProjectId(options);
    const config = manifest.loadConfig(options);
    const oldRefOrPath = manifest.getInstanceTarget(instanceId, config);
    if (isLocalPath(oldRefOrPath)) {
      throw new FirebaseError(
        `Updating an extension with local source is not neccessary. ` +
          `Rerun "firebase deploy" or restart the emulator after making changes to your local extension source. ` +
          `If you've edited the extension param spec, you can edit an extension instance's params ` +
          `interactively by running "firebase ext:configure --local {instance-id}"`,
      );
    }

    const oldRef = manifest.getInstanceRef(instanceId, config);
    const oldExtensionVersion = await extensionsApi.getExtensionVersion(
      refs.toExtensionVersionRef(oldRef),
    );
    updateSource = inferUpdateSource(updateSource, refs.toExtensionRef(oldRef));

    const newSourceOrigin = getSourceOrigin(updateSource);
    if (
      ![SourceOrigin.PUBLISHED_EXTENSION, SourceOrigin.PUBLISHED_EXTENSION_VERSION].includes(
        newSourceOrigin,
      )
    ) {
      throw new FirebaseError(`Only updating to a published extension version is allowed`);
    }

    const newExtensionVersion = await extensionsApi.getExtensionVersion(updateSource);

    if (oldExtensionVersion.ref === newExtensionVersion.ref) {
      utils.logLabeledBullet(
        logPrefix,
        `${clc.bold(instanceId)} is already up to date. Its version is ${clc.bold(
          newExtensionVersion.ref,
        )}.`,
      );
      return;
    }
    utils.logLabeledBullet(
      logPrefix,
      `Updating ${clc.bold(instanceId)} from version ${clc.bold(
        oldExtensionVersion.ref,
      )} to version ${clc.bold(newExtensionVersion.ref)}.`,
    );

    if (
      !(await confirm({
        nonInteractive: options.nonInteractive,
        force: options.force,
        default: false,
      }))
    ) {
      utils.logLabeledBullet(logPrefix, "Update aborted.");
      return;
    }

    if (secretsUtils.usesSecrets(newExtensionVersion.spec)) {
      await secretsUtils.ensureSecretManagerApiEnabled(options);
    }

    const oldParamValues = manifest.readInstanceParam({
      instanceId,
      projectDir: config.projectDir,
    });

    const newParamBindingOptions = await paramHelper.getParamsForUpdate({
      spec: oldExtensionVersion.spec,
      newSpec: newExtensionVersion.spec,
      currentParams: oldParamValues,
      projectId,
      nonInteractive: options.nonInteractive,
      instanceId,
    });
    const eventsConfig = newExtensionVersion.spec.events
      ? await askUserForEventsConfig.askForEventsConfig(
          newExtensionVersion.spec.events,
          "${param:PROJECT_ID}",
          instanceId,
        )
      : undefined;
    if (eventsConfig) {
      newParamBindingOptions.EVENTARC_CHANNEL = { baseValue: eventsConfig.channel };
      newParamBindingOptions.ALLOWED_EVENT_TYPES = {
        baseValue: eventsConfig.allowedEventTypes.join(","),
      };
    }
    await manifest.writeToManifest(
      [
        {
          instanceId,
          ref: refs.parse(newExtensionVersion.ref),
          params: newParamBindingOptions,
          extensionSpec: newExtensionVersion.spec,
          extensionVersion: newExtensionVersion,
        },
      ],
      config,
      {
        nonInteractive: options.nonInteractive,
        force: true, // Skip asking for permission again
      },
    );
    displayDeveloperTOSWarning();
    return;
  });

import * as clc from "colorette";
import { marked } from "marked";
import * as TerminalRenderer from "marked-terminal";

import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { FirebaseError } from "../error";
import * as extensionsApi from "../extensions/extensionsApi";
import {
  ensureExtensionsApiEnabled,
  logPrefix,
  getSourceOrigin,
  SourceOrigin,
  diagnoseAndFixProject,
  isLocalPath,
} from "../extensions/extensionsHelper";
import * as paramHelper from "../extensions/paramHelper";
import { inferUpdateSource } from "../extensions/updateHelper";
import * as secretsUtils from "../extensions/secretsUtils";
import * as refs from "../extensions/refs";
import { getProjectId } from "../projectUtils";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";
import { confirm } from "../prompt";
import * as manifest from "../extensions/manifest";
import { Options } from "../options";
import * as askUserForEventsConfig from "../extensions/askUserForEventsConfig";
import { displayDeveloperTOSWarning } from "../extensions/tos";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

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

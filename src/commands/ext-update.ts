import * as clc from "cli-color";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const { marked } = require("marked");
import TerminalRenderer from "marked-terminal";

import { checkMinRequiredVersion } from "../checkMinRequiredVersion.js";
import { Command } from "../command.js";
import { FirebaseError } from "../error.js";
import * as extensionsApi from "../extensions/extensionsApi.js";
import {
  ensureExtensionsApiEnabled,
  logPrefix,
  getSourceOrigin,
  SourceOrigin,
  confirm,
  diagnoseAndFixProject,
  isLocalPath,
} from "../extensions/extensionsHelper";
import * as paramHelper from "../extensions/paramHelper.js";
import { inferUpdateSource } from "../extensions/updateHelper.js";
import * as refs from "../extensions/refs.js";
import { getProjectId, needProjectId } from "../projectUtils.js";
import { requirePermissions } from "../requirePermissions.js";
import * as utils from "../utils.js";
import { previews } from "../previews.js";
import * as manifest from "../extensions/manifest.js";
import { Options } from "../options.js";
import * as askUserForEventsConfig from "../extensions/askUserForEventsConfig.js";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

/**
 * Command for updating an existing extension instance
 */
export const command = new Command("ext:update <extensionInstanceId> [updateSource]")
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
  .before(checkMinRequiredVersion, "extMinVersion")
  .before(diagnoseAndFixProject)
  .option("--local", "deprecated")
  .withForce()
  .action(async (instanceId: string, updateSource: string, options: Options) => {
    const projectId = getProjectId(options);
    const config = manifest.loadConfig(options);

    if (options.local) {
      utils.logLabeledWarning(
        logPrefix,
        "As of firebase-tools@11.0.0, the `--local` flag is no longer required, as it is the default behavior."
      );
    }

    const oldRefOrPath = manifest.getInstanceTarget(instanceId, config);
    if (isLocalPath(oldRefOrPath)) {
      throw new FirebaseError(
        `Updating an extension with local source is not neccessary. ` +
          `Rerun "firebase deploy" or restart the emulator after making changes to your local extension source. ` +
          `If you've edited the extension param spec, you can edit an extension instance's params ` +
          `interactively by running "firebase ext:configure --local {instance-id}"`
      );
    }

    const oldRef = manifest.getInstanceRef(instanceId, config);
    const oldExtensionVersion = await extensionsApi.getExtensionVersion(
      refs.toExtensionVersionRef(oldRef)
    );
    updateSource = inferUpdateSource(updateSource, refs.toExtensionRef(oldRef));

    const newSourceOrigin = getSourceOrigin(updateSource);
    if (
      ![SourceOrigin.PUBLISHED_EXTENSION, SourceOrigin.PUBLISHED_EXTENSION_VERSION].includes(
        newSourceOrigin
      )
    ) {
      throw new FirebaseError(`Only updating to a published extension version is allowed`);
    }

    const newExtensionVersion = await extensionsApi.getExtensionVersion(updateSource);

    if (oldExtensionVersion.ref === newExtensionVersion.ref) {
      utils.logLabeledBullet(
        logPrefix,
        `${clc.bold(instanceId)} is already up to date. Its version is ${clc.bold(
          newExtensionVersion.ref
        )}.`
      );
      return;
    }

    utils.logLabeledBullet(
      logPrefix,
      `Updating ${clc.bold(instanceId)} from version ${clc.bold(
        oldExtensionVersion.ref
      )} to version ${clc.bold(newExtensionVersion.ref)}.`
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

    const oldParamValues = manifest.readInstanceParam({
      instanceId,
      projectDir: config.projectDir,
    });

    const newParamBindingOptions = await paramHelper.getParamsForUpdate({
      spec: oldExtensionVersion.spec,
      newSpec: newExtensionVersion.spec,
      currentParams: oldParamValues,
      projectId,
      // TODO(b/230598656): Clean up paramsEnvPath after v11 launch.
      paramsEnvPath: "",
      nonInteractive: options.nonInteractive,
      instanceId,
    });
    const eventsConfig = newExtensionVersion.spec.events
      ? await askUserForEventsConfig.askForEventsConfig(
          newExtensionVersion.spec.events,
          "${param:PROJECT_ID}",
          instanceId
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
      }
    );
    manifest.showPostDeprecationNotice();
    return;
  });

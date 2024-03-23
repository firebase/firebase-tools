import * as clc from "colorette";
import { marked } from "marked";
import * as semver from "semver";
import * as TerminalRenderer from "marked-terminal";

import { displayExtensionVersionInfo } from "../extensions/displayExtensionInfo";
import * as askUserForEventsConfig from "../extensions/askUserForEventsConfig";
import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { getProjectId, needProjectId } from "../projectUtils";
import * as extensionsApi from "../extensions/extensionsApi";
import { ExtensionVersion, ExtensionSource } from "../extensions/types";
import * as refs from "../extensions/refs";
import * as secretsUtils from "../extensions/secretsUtils";
import * as paramHelper from "../extensions/paramHelper";
import {
  createSourceFromLocation,
  ensureExtensionsApiEnabled,
  logPrefix,
  promptForValidInstanceId,
  diagnoseAndFixProject,
  isLocalPath,
} from "../extensions/extensionsHelper";
import { resolveVersion } from "../deploy/extensions/planner";
import { getRandomString } from "../extensions/utils";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";
import { trackGA4 } from "../track";
import { confirm } from "../prompt";
import { Options } from "../options";
import * as manifest from "../extensions/manifest";
import { displayDeveloperTOSWarning } from "../extensions/tos";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

/**
 * Command for installing an extension
 */
export const command = new Command("ext:install [extensionRef]")
  .description(
    "add an uploaded extension to firebase.json if [publisherId/extensionId] is provided;" +
      "or, add a local extension if [localPath] is provided",
  )
  .option("--local", "deprecated")
  .withForce()
  .before(requirePermissions, ["firebaseextensions.instances.create"])
  .before(ensureExtensionsApiEnabled)
  .before(checkMinRequiredVersion, "extMinVersion")
  .before(diagnoseAndFixProject)
  .action(async (extensionRef: string, options: Options) => {
    if (options.local) {
      utils.logLabeledWarning(
        logPrefix,
        "As of firebase-tools@11.0.0, the `--local` flag is no longer required, as it is the default behavior.",
      );
    }
    if (!extensionRef) {
      throw new FirebaseError(
        "Extension ref is required to install. To see a full list of available extensions, go to Extensions Hub (https://extensions.dev/extensions).",
      );
    }
    let source: ExtensionSource | undefined;
    let extensionVersion: ExtensionVersion | undefined;
    const projectId = getProjectId(options);
    // If the user types in a local path (prefixed with ~/, ../, or ./), install from local source.
    // Otherwise, treat the input as an extension reference and proceed with reference-based installation.
    if (isLocalPath(extensionRef)) {
      // TODO(b/228444119): Create source should happen at deploy time.
      // Should parse spec locally so we don't need project ID.
      source = await createSourceFromLocation(needProjectId({ projectId }), extensionRef);
      await displayExtensionVersionInfo({ spec: source.spec });
    } else {
      const extension = await extensionsApi.getExtension(extensionRef);
      const ref = refs.parse(extensionRef);
      ref.version = await resolveVersion(ref, extension);
      const extensionVersionRef = refs.toExtensionVersionRef(ref);
      extensionVersion = await extensionsApi.getExtensionVersion(extensionVersionRef);
      await displayExtensionVersionInfo({
        spec: extensionVersion.spec,
        extensionVersion,
        latestApprovedVersion: extension.latestApprovedVersion,
        latestVersion: extension.latestVersion,
      });
      if (extensionVersion.state === "DEPRECATED") {
        throw new FirebaseError(
          `Extension version ${clc.bold(
            extensionVersionRef,
          )} is deprecated and cannot be installed. To install the latest non-deprecated version, omit the version in the extension ref.`,
        );
      }
      logger.info();
      // Check if selected version is older than the latest approved version, or the latest version only if there is no approved version.
      if (
        (extension.latestApprovedVersion &&
          semver.gt(extension.latestApprovedVersion, extensionVersion.spec.version)) ||
        (!extension.latestApprovedVersion &&
          extension.latestVersion &&
          semver.gt(extension.latestVersion, extensionVersion.spec.version))
      ) {
        const version = extension.latestApprovedVersion || extension.latestVersion;
        logger.info(
          `You are about to install extension version ${clc.bold(
            extensionVersion.spec.version,
          )} which is older than the latest ${
            extension.latestApprovedVersion ? "accepted version" : "version"
          } ${clc.bold(version!)}.`,
        );
      }
    }
    if (!source && !extensionVersion) {
      throw new FirebaseError(
        `Failed to parse ${clc.bold(
          extensionRef,
        )} as an extension version or a path to a local extension. Please specify a valid reference.`,
      );
    }
    if (
      !(await confirm({
        nonInteractive: options.nonInteractive,
        force: options.force,
        default: true,
      }))
    ) {
      return;
    }
    const spec = source?.spec ?? extensionVersion?.spec;
    if (!spec) {
      throw new FirebaseError(
        `Could not find the extension.yaml for extension '${clc.bold(
          extensionRef,
        )}'. Please make sure this is a valid extension and try again.`,
      );
    }

    if (source) {
      void trackGA4("extension_added_to_manifest", {
        published: "local",
        interactive: options.nonInteractive ? "false" : "true",
      });
    } else if (extensionVersion) {
      void trackGA4("extension_added_to_manifest", {
        published: extensionVersion.listing?.state === "APPROVED" ? "published" : "uploaded",
        interactive: options.nonInteractive ? "false" : "true",
      });
    }

    try {
      return installToManifest({
        projectId,
        extensionRef,
        source,
        extVersion: extensionVersion,
        nonInteractive: options.nonInteractive,
        force: options.force,
      });
    } catch (err: any) {
      if (!(err instanceof FirebaseError)) {
        throw new FirebaseError(`Error occurred saving the extension to manifest: ${err.message}`, {
          original: err,
        });
      }
      throw err;
    }
  });

interface InstallExtensionOptions {
  projectId?: string;
  extensionRef: string;
  source?: ExtensionSource;
  extVersion?: ExtensionVersion;
  nonInteractive: boolean;
  force?: boolean;
}

/**
 * Saves the extension instance config values to the manifest.
 *
 * Requires running `firebase deploy` to install it to the Firebase project.
 * @param options
 */
async function installToManifest(options: InstallExtensionOptions): Promise<void> {
  const { projectId, extensionRef, extVersion, source, nonInteractive, force } = options;
  const isLocalSource = isLocalPath(extensionRef);

  const spec = extVersion?.spec ?? source?.spec;
  if (!spec) {
    throw new FirebaseError(
      `Could not find the extension.yaml for ${extensionRef}. Please make sure this is a valid extension and try again.`,
    );
  }

  if (secretsUtils.usesSecrets(spec)) {
    await secretsUtils.ensureSecretManagerApiEnabled(options);
  }

  const config = manifest.loadConfig(options);

  let instanceId = spec.name;
  while (manifest.instanceExists(instanceId, config)) {
    instanceId = await promptForValidInstanceId(`${spec.name}-${getRandomString(4)}`);
  }

  const paramBindingOptions = await paramHelper.getParams({
    projectId,
    paramSpecs: (spec.params ?? []).concat(spec.systemParams ?? []),
    nonInteractive,
    instanceId,
  });
  const eventsConfig = spec.events
    ? await askUserForEventsConfig.askForEventsConfig(
        spec.events,
        "${param:PROJECT_ID}",
        instanceId,
      )
    : undefined;
  if (eventsConfig) {
    paramBindingOptions.EVENTARC_CHANNEL = { baseValue: eventsConfig.channel };
    paramBindingOptions.ALLOWED_EVENT_TYPES = {
      baseValue: eventsConfig.allowedEventTypes.join(","),
    };
  }
  const ref = extVersion ? refs.parse(extVersion.ref) : undefined;
  await manifest.writeToManifest(
    [
      {
        instanceId,
        ref: !isLocalSource ? ref : undefined,
        localPath: isLocalSource ? extensionRef : undefined,
        params: paramBindingOptions,
        extensionSpec: spec,
      },
    ],
    config,
    { nonInteractive, force: force ?? false },
  );
  displayDeveloperTOSWarning();
}

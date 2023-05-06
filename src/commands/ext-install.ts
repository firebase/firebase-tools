import * as clc from "colorette";
import { marked } from "marked";
import * as TerminalRenderer from "marked-terminal";

import { displayExtInfo } from "../extensions/displayExtensionInfo";
import * as askUserForEventsConfig from "../extensions/askUserForEventsConfig";
import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { FirebaseError } from "../error";
import { getProjectId, needProjectId } from "../projectUtils";
import * as extensionsApi from "../extensions/extensionsApi";
import { ExtensionVersion, ExtensionSource } from "../extensions/types";
import * as refs from "../extensions/refs";
import * as secretsUtils from "../extensions/secretsUtils";
import { displayWarningPrompts } from "../extensions/warnings";
import * as paramHelper from "../extensions/paramHelper";
import {
  createSourceFromLocation,
  ensureExtensionsApiEnabled,
  logPrefix,
  promptForOfficialExtension,
  promptForValidInstanceId,
  diagnoseAndFixProject,
  isUrlPath,
  isLocalPath,
  canonicalizeRefInput,
} from "../extensions/extensionsHelper";
import { confirm } from "../prompt";
import { getRandomString } from "../extensions/utils";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";
import { track } from "../track";
import * as experiments from "../experiments";
import { Options } from "../options";
import * as manifest from "../extensions/manifest";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

/**
 * Command for installing an extension
 */
export const command = new Command("ext:install [extensionName]")
  .description(
    "install an official extension if [extensionName] or [extensionName@version] is provided; " +
      (experiments.isEnabled("extdev")
        ? "install a local extension if [localPathOrUrl] or [url#root] is provided; install a published extension (not authored by Firebase) if [publisherId/extensionId] is provided "
        : "") +
      "or run with `-i` to see all available extensions."
  )
  .option("--local", "deprecated")
  .withForce()
  .before(requirePermissions, ["firebaseextensions.instances.create"])
  .before(ensureExtensionsApiEnabled)
  .before(checkMinRequiredVersion, "extMinVersion")
  .before(diagnoseAndFixProject)
  .action(async (extensionName: string, options: Options) => {
    const projectId = getProjectId(options);
    // TODO(b/230598656): Clean up paramsEnvPath after v11 launch.
    const paramsEnvPath = "";
    let learnMore = false;
    if (!extensionName) {
      if (options.interactive) {
        learnMore = true;
        extensionName = await promptForOfficialExtension(
          "Which official extension do you wish to install?\n" +
            "  Select an extension, then press Enter to learn more."
        );
      } else {
        throw new FirebaseError(
          `Unable to find published extension '${clc.bold(extensionName)}'. ` +
            `Run ${clc.bold(
              "firebase ext:install -i"
            )} to select from the list of all available published extensions.`
        );
      }
    }
    let source;
    let extensionVersion;

    // TODO(b/220900194): Remove when deprecating old install flow.
    // --local doesn't support urlPath so this will become dead codepath.
    if (isUrlPath(extensionName)) {
      throw new FirebaseError(
        `Installing with a source url is no longer supported in the CLI. Please use Firebase Console instead.`
      );
    }
    if (options.local) {
      utils.logLabeledWarning(
        logPrefix,
        "As of firebase-tools@11.0.0, the `--local` flag is no longer required, as it is the default behavior."
      );
    }

    // If the user types in a local path (prefixed with ~/, ../, or ./), install from local source.
    // Otherwise, treat the input as an extension reference and proceed with reference-based installation.
    if (isLocalPath(extensionName)) {
      // TODO(b/228444119): Create source should happen at deploy time.
      // Should parse spec locally so we don't need project ID.
      source = await createSourceFromLocation(needProjectId({ projectId }), extensionName);
      await displayExtInfo(extensionName, "", source.spec);
      void track("Extension Install", "Install by Source", options.interactive ? 1 : 0);
    } else {
      void track("Extension Install", "Install by Extension Ref", options.interactive ? 1 : 0);
      extensionName = await canonicalizeRefInput(extensionName);
      extensionVersion = await extensionsApi.getExtensionVersion(extensionName);
      await infoExtensionVersion({
        extensionName,
        extensionVersion,
      });
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
    if (!source && !extensionVersion) {
      throw new FirebaseError(
        "Could not find a source. Please specify a valid source to continue."
      );
    }
    const spec = source?.spec ?? extensionVersion?.spec;
    if (!spec) {
      throw new FirebaseError(
        `Could not find the extension.yaml for extension '${clc.bold(
          extensionName
        )}'. Please make sure this is a valid extension and try again.`
      );
    }
    if (learnMore) {
      utils.logLabeledBullet(
        logPrefix,
        `You selected: ${clc.bold(spec.displayName || "")}.\n` +
          `${spec.description}\n` +
          `View details: https://firebase.google.com/products/extensions/${spec.name}\n`
      );
    }

    try {
      return installToManifest({
        paramsEnvPath,
        projectId,
        extensionName,
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

async function infoExtensionVersion(args: {
  extensionName: string;
  extensionVersion: ExtensionVersion;
}): Promise<void> {
  const ref = refs.parse(args.extensionName);
  await displayExtInfo(args.extensionName, ref.publisherId, args.extensionVersion.spec, true);
  await displayWarningPrompts(ref.publisherId, args.extensionVersion);
}

interface InstallExtensionOptions {
  paramsEnvPath?: string;
  projectId?: string;
  extensionName: string;
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
  const { projectId, extensionName, extVersion, source, paramsEnvPath, nonInteractive, force } =
    options;
  const isLocalSource = isLocalPath(extensionName);

  const spec = extVersion?.spec ?? source?.spec;
  if (!spec) {
    throw new FirebaseError(
      `Could not find the extension.yaml for ${extensionName}. Please make sure this is a valid extension and try again.`
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
    paramsEnvPath,
    instanceId,
  });
  const eventsConfig = spec.events
    ? await askUserForEventsConfig.askForEventsConfig(
        spec.events,
        "${param:PROJECT_ID}",
        instanceId
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
        localPath: isLocalSource ? extensionName : undefined,
        params: paramBindingOptions,
        extensionSpec: spec,
      },
    ],
    config,
    { nonInteractive, force: force ?? false }
  );
  manifest.showPostDeprecationNotice();
}

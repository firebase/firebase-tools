import * as clc from "colorette";

import { logPrefix } from "./extensionsHelper";
import { humanReadable } from "../deploy/extensions/deploymentSummary";
import { InstanceSpec, getExtensionVersion } from "../deploy/extensions/planner";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { Options } from "../options";
import * as utils from "../utils";

const toListEntry = (i: InstanceSpec) => {
  const idAndRef = humanReadable(i);
  const sourceCodeLink = `\n\t[Source Code](${
    i.extensionVersion?.buildSourceUri ?? i.extensionVersion?.sourceDownloadUri
  })`;
  const githubLink = i.extensionVersion?.spec?.sourceUrl
    ? `\n\t[Publisher Contact](${i.extensionVersion?.spec.sourceUrl})`
    : "";
  return `${idAndRef}${sourceCodeLink}${githubLink}`;
};

/**
 * Display a single, grouped warning about extension status for all instances in a deployment.
 * Returns true if any instances triggered a warning.
 * @param instancesToCreate A list of instances that will be created in this deploy
 */
export async function displayWarningsForDeploy(instancesToCreate: InstanceSpec[]) {
  const uploadedExtensionInstances = instancesToCreate.filter((i) => i.ref);
  for (const i of uploadedExtensionInstances) {
    await getExtensionVersion(i);
  }
  const unpublishedExtensions = uploadedExtensionInstances.filter(
    (i) => i.extensionVersion?.listing?.state !== "APPROVED",
  );

  if (unpublishedExtensions.length) {
    const humanReadableList = unpublishedExtensions.map(toListEntry).join("\n");
    utils.logLabeledBullet(
      logPrefix,
      `The following extension versions have not been published to the Firebase Extensions Hub:\n${humanReadableList}\n.` +
        "Unpublished extensions have not been reviewed by " +
        "Firebase. Please make sure you trust the extension publisher before installing this extension.",
    );
  }
  return unpublishedExtensions.length > 0;
}

export function outOfBandChangesWarning(instanceIds: string[], isDynamic: boolean) {
  const extra = isDynamic
    ? ""
    : " To avoid this, run `firebase ext:export` to sync these changes to your local extensions manifest.";
  logger.warn(
    "The following instances may have been changed in the Firebase console or by another machine since the last deploy from this machine.\n\t" +
      clc.bold(instanceIds.join("\n\t")) +
      `\nIf you proceed with this deployment, those changes will be overwritten.${extra}`,
  );
}

const FAQ_URL = "https://firebase.google.com/docs/extensions/faq-and-troubleshooting";

/** Commands that trigger a standard deprecation warning before execution. */
const WARN_BEFORE_COMMANDS = new Set([
  "ext:install",
  "ext:configure",
  "ext:update",
  "ext:sdk:install",
]);

/** Publisher commands that trigger a prominent warning banner before execution. */
const WARN_STRONGLY_BEFORE_COMMANDS = new Set([
  "ext:dev:init",
  "ext:dev:upload",
  "ext:dev:list",
  "ext:dev:usage",
  "ext:dev:undeprecate",
]);

/** Commands that display a post-execution footer warning notice after completion. */
const WARN_AFTER_COMMANDS = new Set(["ext:list", "ext:info"]);

/**
 * Checks if deprecation warnings should be silenced (e.g. non-interactive, JSON, non-TTY, quiet mode, or CI).
 * @param options Command execution options object.
 */
export function isSilenced(options: Options | Record<string, unknown>): boolean {
  const opts = options as Record<string, unknown>;
  if (
    opts?.json ||
    utils.getInheritedOption(options, "json") ||
    opts?.nonInteractive ||
    utils.getInheritedOption(options, "nonInteractive") ||
    !process.stdout?.isTTY ||
    opts?.quiet ||
    utils.getInheritedOption(options, "quiet")
  ) {
    return true;
  }
  if (
    utils.isRunningInGithubAction() ||
    (!!process.env.CI && process.env.CI !== "false") ||
    !!process.env.BUILD_ID ||
    !!process.env.TF_BUILD ||
    !!process.env.GITHUB_ACTIONS
  ) {
    return true;
  }
  return false;
}

/**
 * Displays deprecation warnings or throws hard exit errors before an ext:* command executes.
 * @param commandName Name of the command being run (e.g. "ext:install").
 * @param options Command execution options object.
 */
export function showDeprecationWarningBefore(
  commandName: string,
  options: Options | Record<string, unknown>,
): void {
  if (commandName === "ext:dev:register") {
    throw new FirebaseError(
      `ext:dev:register is disabled. Registering new publisher profile IDs is no longer supported.\n` +
        `The Firebase Extensions service will shut down on March 31, 2027.\n` +
        `Learn more: ${FAQ_URL}`,
      { exit: 1 },
    );
  }

  if (isSilenced(options)) {
    return;
  }

  if (WARN_BEFORE_COMMANDS.has(commandName)) {
    logger.warn(
      clc.yellow(
        `⚠ Firebase Extensions will shut down on March 31, 2027. You will not be able to install or edit extensions after this date. Learn more: ${FAQ_URL}`,
      ),
    );
  } else if (WARN_STRONGLY_BEFORE_COMMANDS.has(commandName)) {
    logger.warn(
      clc.yellow(
        `================================================================================\n` +
          `⚠ Notice for Publishers: Firebase Extensions will shut down on March 31, 2027.\n` +
          `Learn more: ${FAQ_URL}\n` +
          `================================================================================`,
      ),
    );
  }
}

/**
 * Displays post-execution deprecation warnings (e.g. single-line footer for ext:list and ext:info).
 * @param commandName Name of the command being run.
 * @param options Command execution options object.
 */
export function showDeprecationWarningAfter(
  commandName: string,
  options: Options | Record<string, unknown>,
): void {
  if (isSilenced(options) || !WARN_AFTER_COMMANDS.has(commandName)) {
    return;
  }

  logger.warn(
    clc.yellow(
      `⚠ Notice: Firebase Extensions will shut down on March 31, 2027. Learn more: ${FAQ_URL}`,
    ),
  );
}

import * as clc from "colorette";
import { marked } from "marked";
import * as TerminalRenderer from "marked-terminal";

import { Command } from "../command";
import {
  ReleaseStage,
  logPrefix,
  uploadExtensionVersionFromLocalSource,
  uploadExtensionVersionFromGitHubSource,
  ensureExtensionsPublisherApiEnabled,
  getMissingPublisherError,
} from "../extensions/extensionsHelper";
import * as refs from "../extensions/refs";
import { findExtensionYaml } from "../extensions/localHelper";
import { consoleInstallLink } from "../extensions/publishHelpers";
import { ExtensionVersion, PublisherProfile } from "../extensions/types";
import { requireAuth } from "../requireAuth";
import { FirebaseError } from "../error";
import { acceptLatestPublisherTOS } from "../extensions/tos";
import * as utils from "../utils";
import { Options } from "../options";
import { getPublisherProfile } from "../extensions/publisherApi";
import { getPublisherProjectFromName } from "../extensions/extensionsHelper";
import { getFirebaseProject } from "../management/projects";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

/**
 * Command for publishing an extension version.
 */
export const command = new Command("ext:dev:upload <extensionRef>")
  .description(`upload a new version of an extension`)
  .option(`-s, --stage <stage>`, `release stage (supports "alpha", "beta", "rc", and "stable")`)
  .option(`--repo <repo>`, `Public GitHub repo URI that contains the extension source`)
  .option(`--ref <ref>`, `commit hash, branch, or tag to build from the repo (defaults to HEAD)`)
  .option(
    `--root <root>`,
    `root directory that contains this extension (defaults to last uploaded root or "/" if none set)`,
  )
  .option(`--local`, `upload from local source instead`)
  .withForce()
  .help(
    "if you have not previously uploaded a version of this extension, this will " +
      "create the extension. If you have previously uploaded a version of this extension, this version must " +
      "be greater than previous versions.",
  )
  .before(requireAuth)
  .before(ensureExtensionsPublisherApiEnabled)
  .action(uploadExtensionAction);

export interface UploadExtensionOptions extends Options {
  repo?: string;
  ref?: string;
  root?: string;
  stage?: string;
}
export async function uploadExtensionAction(
  extensionRef: string,
  options: UploadExtensionOptions,
): Promise<ExtensionVersion | undefined> {
  const { publisherId, extensionId, version } = refs.parse(extensionRef);
  if (version) {
    throw new FirebaseError(
      `The input extension reference must be of the format ${clc.bold(
        "<publisherId>/<extensionId>",
      )}. Version should not be supplied and will be inferred directly from extension.yaml. Please increment the version in extension.yaml if you would like to bump/specify a version.`,
    );
  }
  if (!publisherId || !extensionId) {
    throw new FirebaseError(
      `Error parsing publisher ID and extension ID from extension reference '${clc.bold(
        extensionRef,
      )}'. Please use the format '${clc.bold("<publisherId>/<extensionId>")}'.`,
    );
  }

  // Get the project number and check the publisher TOS
  let profile: PublisherProfile | undefined;
  try {
    profile = await getPublisherProfile("-", publisherId);
  } catch (err: any) {
    if (err.status === 404) {
      throw getMissingPublisherError(publisherId);
    }
    throw err;
  }
  const projectNumber = `${getPublisherProjectFromName(profile.name)}`;
  const { projectId } = await getFirebaseProject(projectNumber);
  await acceptLatestPublisherTOS(options, projectNumber);

  let res;
  if (options.local) {
    const extensionYamlDirectory = findExtensionYaml(process.cwd());
    res = await uploadExtensionVersionFromLocalSource({
      publisherId,
      extensionId,
      rootDirectory: extensionYamlDirectory,
      nonInteractive: options.nonInteractive,
      force: options.force,
      stage: options.stage as ReleaseStage,
    });
  } else {
    res = await uploadExtensionVersionFromGitHubSource({
      publisherId,
      extensionId,
      repoUri: options.repo,
      sourceRef: options.ref,
      extensionRoot: options.root,
      nonInteractive: options.nonInteractive,
      force: options.force,
      stage: options.stage as ReleaseStage,
    });
  }
  if (res) {
    utils.logLabeledBullet(logPrefix, marked(`[Install Link](${consoleInstallLink(res.ref)})`));
    const version = res.ref.split("@")[1];
    utils.logLabeledBullet(
      logPrefix,
      marked(
        `[View in Console](${utils.consoleUrl(
          projectId,
          `/publisher/extensions/${extensionId}/v/${version}`,
        )})`,
      ),
    );
  }
  return res;
}

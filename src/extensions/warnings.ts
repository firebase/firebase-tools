import * as marked from "marked";
import * as clc from "cli-color";

import { ExtensionVersion, RegistryLaunchStage } from "./extensionsApi";
import { printSourceDownloadLink } from "./displayExtensionInfo";
import { logPrefix } from "./extensionsHelper";
import { getTrustedPublishers } from "./resolveSource";
import { promptOnce } from "../prompt";
import * as utils from "../utils";

interface displayEAPWarningParameters {
  publisherId: string;
  sourceDownloadUri: string;
  githubLink?: string;
}

function displayEAPWarning({
  publisherId,
  sourceDownloadUri,
  githubLink,
}: displayEAPWarningParameters) {
  const publisherNameLink = githubLink ? `[${publisherId}](${githubLink})` : publisherId;
  const warningMsg = `This extension is in preview and is built by a developer in the [Extensions Publisher Early Access Program](http://bit.ly/firex-provider). Its functionality might change in backward-incompatible ways. Since this extension isn't built by Firebase, reach out to ${publisherNameLink} with questions about this extension.`;
  const legalMsg =
    "\n\nIt is provided “AS IS”, without any warranty, express or implied, from Google. Google disclaims all liability for any damages, direct or indirect, resulting from the use of the extension, and its functionality might change in backward - incompatible ways.";
  utils.logLabeledBullet(logPrefix, marked(warningMsg + legalMsg));
  printSourceDownloadLink(sourceDownloadUri);
}

function displayExperimentalWarning() {
  utils.logLabeledBullet(
    logPrefix,
    marked(
      `${clc.yellow.bold("Important")}: This extension is ${clc.bold(
        "experimental"
      )} and may not be production-ready. Its functionality might change in backward-incompatible ways before its official release, or it may be discontinued.`
    )
  );
}

export async function displayWarningPrompts(
  publisherId: string,
  launchStage: RegistryLaunchStage,
  extensionVersion: ExtensionVersion
): Promise<boolean> {
  const trustedPublishers = await getTrustedPublishers();
  if (!trustedPublishers.includes(publisherId)) {
    displayEAPWarning({
      publisherId,
      sourceDownloadUri: extensionVersion.sourceDownloadUri,
      githubLink: extensionVersion.spec.sourceUrl,
    });
  } else if (launchStage === RegistryLaunchStage.EXPERIMENTAL) {
    displayExperimentalWarning();
  } else {
    // Otherwise, this is an official extension and requires no warning prompts.
    return true;
  }
  return await promptOnce({
    type: "confirm",
    message: "Do you acknowledge the status of this extension?",
    default: true,
  });
}

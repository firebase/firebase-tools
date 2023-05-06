import { marked } from "marked";
import * as clc from "colorette";

import { ExtensionVersion } from "./types";
import { printSourceDownloadLink } from "./displayExtensionInfo";
import { logPrefix } from "./extensionsHelper";
import { getTrustedPublishers } from "./resolveSource";
import { humanReadable } from "../deploy/extensions/deploymentSummary";
import { InstanceSpec, getExtension } from "../deploy/extensions/planner";
import * as utils from "../utils";
import { logger } from "../logger";

interface displayEAPWarningParameters {
  publisherId: string;
  sourceDownloadUri: string;
  githubLink?: string;
}

function displayEAPWarning({
  publisherId,
  sourceDownloadUri,
  githubLink,
}: displayEAPWarningParameters): void {
  const publisherNameLink = githubLink ? `[${publisherId}](${githubLink})` : publisherId;
  const warningMsg = `This extension is in preview and is built by a developer in the [Extensions Publisher Early Access Program](http://bit.ly/firex-provider). Its functionality might change in backward-incompatible ways. Since this extension isn't built by Firebase, reach out to ${publisherNameLink} with questions about this extension.`;
  const legalMsg =
    "\n\nIt is provided “AS IS”, without any warranty, express or implied, from Google. Google disclaims all liability for any damages, direct or indirect, resulting from the use of the extension, and its functionality might change in backward - incompatible ways.";
  utils.logLabeledBullet(logPrefix, marked(warningMsg + legalMsg));
  printSourceDownloadLink(sourceDownloadUri);
}

/**
 * Show warning if extension is experimental or developed by 3P.
 */
export async function displayWarningPrompts(
  publisherId: string,
  extensionVersion: ExtensionVersion
): Promise<void> {
  const trustedPublishers = await getTrustedPublishers();
  if (!trustedPublishers.includes(publisherId)) {
    displayEAPWarning({
      publisherId,
      sourceDownloadUri: extensionVersion.sourceDownloadUri,
      githubLink: extensionVersion.spec.sourceUrl,
    });
  } else {
    // Otherwise, this is an official extension and requires no warning prompts.
    return;
  }
}

const toListEntry = (i: InstanceSpec) => {
  const idAndRef = humanReadable(i);
  const sourceCodeLink = `\n\t[Source Code](${i.extensionVersion?.sourceDownloadUri})`;
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
  const trustedPublishers = await getTrustedPublishers();
  const publishedExtensionInstances = instancesToCreate.filter((i) => i.ref);
  for (const i of publishedExtensionInstances) {
    await getExtension(i);
  }

  const eapExtensions = publishedExtensionInstances.filter(
    (i) => !trustedPublishers.includes(i.ref?.publisherId ?? "")
  );

  if (eapExtensions.length) {
    const humanReadableList = eapExtensions.map(toListEntry).join("\n");
    utils.logLabeledBullet(
      logPrefix,
      marked(
        `These extensions are in preview and are built by a developer in the Extensions Publisher Early Access Program (http://bit.ly/firex-provider). Their functionality might change in backwards-incompatible ways. Since these extensions aren't built by Firebase, reach out to their publisher with questions about them.` +
          ` They are provided “AS IS”, without any warranty, express or implied, from Google.` +
          ` Google disclaims all liability for any damages, direct or indirect, resulting from the use of these extensions\n${humanReadableList}`,
        { gfm: false }
      )
    );
  }
  return eapExtensions.length > 0;
}

export function outOfBandChangesWarning(instanceIds: string[]) {
  logger.warn(
    "The following instances may have been changed in the Firebase console or by another machine since the last deploy from this machine.\n\t" +
      clc.bold(instanceIds.join("\n\t")) +
      "\nIf you proceed with this deployment, those changes will be overwritten. To avoid this, run `firebase ext:export` to sync these changes to your local extensions manifest."
  );
}

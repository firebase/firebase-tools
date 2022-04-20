// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const { marked } = require("marked");
import * as clc from "cli-color";

import { ExtensionVersion, RegistryLaunchStage } from "./extensionsApi";
import { printSourceDownloadLink } from "./displayExtensionInfo";
import { logPrefix } from "./extensionsHelper";
import { getTrustedPublishers } from "./resolveSource";
import { humanReadable } from "../deploy/extensions/deploymentSummary";
import { InstanceSpec, getExtension, getExtensionVersion } from "../deploy/extensions/planner";
import { partition } from "../functional";
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
}: displayEAPWarningParameters): void {
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

/**
 * Show warning if extension is experimental or developed by 3P.
 */
export async function displayWarningPrompts(
  publisherId: string,
  launchStage: RegistryLaunchStage,
  extensionVersion: ExtensionVersion
): Promise<void> {
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

  const [eapExtensions, nonEapExtensions] = partition(
    publishedExtensionInstances,
    (i) => !trustedPublishers.includes(i.ref?.publisherId ?? "")
  );
  // Only mark non-eap extensions as experimental.
  const experimental = nonEapExtensions.filter(
    (i) => i.extension!.registryLaunchStage === RegistryLaunchStage.EXPERIMENTAL
  );

  if (experimental.length) {
    const humanReadableList = experimental.map((i) => `\t${humanReadable(i)}`).join("\n");
    utils.logLabeledBullet(
      logPrefix,
      marked(
        `The following are instances of ${clc.bold(
          "experimental"
        )} extensions.They may not be production-ready. Their functionality may change in backward-incompatible ways before their official release, or they may be discontinued.\n${humanReadableList}\n`
      )
    );
  }

  if (eapExtensions.length) {
    const humanReadableList = eapExtensions.map(toListEntry).join("\n");
    utils.logLabeledBullet(
      logPrefix,
      marked(
        `These extensions are in preview and are built by a developer in the Extensions Publisher Early Access Program (http://bit.ly/firex-provider. Their functionality might change in backwards-incompatible ways. Since these extensions aren't built by Firebase, reach out to their publisher with questions about them.` +
          ` They are provided “AS IS”, without any warranty, express or implied, from Google.` +
          ` Google disclaims all liability for any damages, direct or indirect, resulting from the use of these extensions\n${humanReadableList}`
      )
    );
  }
  return experimental.length > 0 || eapExtensions.length > 0;
}

import * as clc from "colorette";
import * as TerminalRenderer from "marked-terminal";
import { marked } from "marked";
marked.setOptions({
  renderer: new TerminalRenderer(),
});

import { logPrefix } from "./extensionsHelper";
import { humanReadable } from "../deploy/extensions/deploymentSummary";
import { InstanceSpec, getExtensionVersion } from "../deploy/extensions/planner";
import { logger } from "../logger";
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
      marked(
        `The following extension versions have not been published to the Firebase Extensions Hub:\n${humanReadableList}\n.` +
          "Unpublished extensions have not been reviewed by " +
          "Firebase. Please make sure you trust the extension publisher before installing this extension.",
        { gfm: false },
      ),
    );
  }
  return unpublishedExtensions.length > 0;
}

export function outOfBandChangesWarning(instanceIds: string[]) {
  logger.warn(
    "The following instances may have been changed in the Firebase console or by another machine since the last deploy from this machine.\n\t" +
      clc.bold(instanceIds.join("\n\t")) +
      "\nIf you proceed with this deployment, those changes will be overwritten. To avoid this, run `firebase ext:export` to sync these changes to your local extensions manifest.",
  );
}

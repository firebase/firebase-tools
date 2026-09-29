import * as clc from "colorette";
import { FirebaseError } from "../../error";
import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";
import { logBullet, logLabeledBullet, logLabeledSuccess } from "../../utils";
import {
  copyTemplate,
  deployRevision,
  getExistingService,
  getServiceConfigs,
  mainContainer,
  missingServiceMessage,
} from "./util";

/** The base image commands only read and update the service; they don't build or upload. */
export const BASE_IMAGE_PERMISSIONS = [
  "run.services.get",
  "run.services.update",
  "run.operations.get",
  "iam.serviceAccounts.actAs",
];

/**
 * Sets the base image of a service, or clears it if baseImage is null. Settings live on the
 * Cloud Run service, so this deploys a new revision, but it doesn't build and it keeps the
 * new revision at 0% traffic. The next `firebase deploy` builds, deploys, and ramps traffic.
 */
export async function setBaseImage(options: Options, baseImage: string | null): Promise<void> {
  const serviceId = options.service as string | undefined;
  if (!serviceId) {
    throw new FirebaseError("Specify the service to configure with --service <serviceId>.");
  }
  const projectId = needProjectId(options);
  const [config] = getServiceConfigs({ ...options, only: `run:${serviceId}` });
  if (!baseImage && config.localBuild) {
    throw new FirebaseError(`Cannot clear the base image of ${serviceId}: local builds need one.`);
  }
  const existing = await getExistingService(projectId, config.region, serviceId);
  if (!existing) {
    throw new FirebaseError(`${missingServiceMessage(config)} Then you can change its base image.`);
  }
  const template = copyTemplate(existing);
  const container = mainContainer(template)!;
  if (!baseImage && !container.baseImageUri) {
    logBullet(`Service ${serviceId} does not have a base image.`);
    return;
  }
  if (baseImage) {
    container.baseImageUri = baseImage;
  } else {
    delete container.baseImageUri;
  }
  logLabeledBullet("run", `Deploying service ${serviceId}...`);
  await deployRevision(existing, template, /* noTraffic= */ true);

  const setting = baseImage
    ? `set the base image to ${clc.bold(baseImage)}`
    : "cleared the base image";
  logLabeledSuccess(
    "run",
    `Service ${clc.bold(serviceId)}: ${setting}. Deployed a new revision without building it; it is not serving traffic.`,
  );
  logBullet(
    `To build and deploy it and send it all traffic, run ${clc.bold(`firebase deploy --only run:${serviceId}`)}`,
  );
}

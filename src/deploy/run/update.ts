import * as clc from "colorette";
import { deploy } from "..";
import { FirebaseError } from "../../error";
import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";
import { logBullet } from "../../utils";
import {
  FIREBASE_APP_ANNOTATION,
  getExistingService,
  getServiceConfigs,
  mainContainer,
  missingServiceMessage,
} from "./util";

/**
 * Updates a service's settings, then builds and deploys it like `firebase deploy` does.
 * Changing the base image always needs a rebuild: images built for a base image leave out the
 * OS and runtime, and images built without one bring their own, which override the base image.
 */
export async function updateService(serviceId: string, options: Options): Promise<void> {
  const newBaseImage = options.baseImage as string | undefined;
  const clearBaseImage = !!options.clearBaseImage;
  const newAppId = options.app as string | undefined;
  const clearApp = !!options.clearApp;
  if (newBaseImage && clearBaseImage) {
    throw new FirebaseError("Use either --base-image or --clear-base-image, not both.");
  }
  if (newAppId && clearApp) {
    throw new FirebaseError("Use either --app or --clear-app, not both.");
  }
  if (!newBaseImage && !clearBaseImage && !newAppId && !clearApp) {
    throw new FirebaseError(
      "Specify a setting to update: --base-image <baseImage>, --clear-base-image, --app <appId>, or --clear-app.",
    );
  }

  const projectId = needProjectId(options);
  const only = `run:${serviceId}`;
  const [config] = getServiceConfigs({ ...options, only });
  if (clearBaseImage && config.localBuild) {
    throw new FirebaseError(`Cannot clear the base image of ${serviceId}: local builds need one.`);
  }
  const existing = await getExistingService(projectId, config.region, serviceId);
  if (!existing) {
    throw new FirebaseError(`${missingServiceMessage(config)} Then you can update it.`);
  }
  let updateBaseImage = Boolean(newBaseImage || clearBaseImage);
  if (clearBaseImage && !mainContainer(existing.template)?.baseImageUri) {
    logBullet(`Service ${clc.bold(serviceId)} does not have a base image.`);
    updateBaseImage = false;
  }
  let updateApp = Boolean(newAppId || clearApp);
  if (clearApp && !existing.annotations?.[FIREBASE_APP_ANNOTATION]) {
    logBullet(`Service ${clc.bold(serviceId)} does not have a linked Firebase Web App.`);
    updateApp = false;
  }
  if (!updateBaseImage && !updateApp) {
    return;
  }

  await deploy(
    ["run"],
    { ...options, only },
    {
      ...(updateBaseImage && { baseImage: newBaseImage ?? null }),
      ...(updateApp && { appId: newAppId ?? null }),
    },
  );
}

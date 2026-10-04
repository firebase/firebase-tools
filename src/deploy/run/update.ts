import { deploy } from "..";
import { FirebaseError } from "../../error";
import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";
import { getExistingService, getServiceConfigs, missingServiceMessage } from "./util";

/**
 * Updates a service's settings, then builds and deploys it like `firebase deploy` does. It always
 * rebuilds and deploys, even if the service already has those settings.
 * Changing the base image always needs a rebuild: images built for a base image leave out the
 * OS and runtime, and images built without one bring their own, which override the base image.
 */
export async function updateService(serviceId: string, options: Options): Promise<void> {
  const newBaseImage = options.baseImage as string | undefined;
  const clearBaseImage = !!options.clearBaseImage;
  if (newBaseImage && clearBaseImage) {
    throw new FirebaseError("Use either --base-image or --clear-base-image, not both.");
  }
  if (!newBaseImage && !clearBaseImage) {
    throw new FirebaseError(
      "Specify a setting to update: --base-image <baseImage> or --clear-base-image.",
    );
  }

  const projectId = needProjectId(options);
  const only = `run:${serviceId}`;
  const configs = getServiceConfigs({ ...options, only });
  for (const config of configs) {
    if (!config.region) {
      throw new FirebaseError(
        `Cloud Run service ${serviceId} is missing a region in firebase.json.`,
      );
    }
    if (!(await getExistingService(projectId, config.region, serviceId))) {
      throw new FirebaseError(`${missingServiceMessage(config)} Then you can update it.`);
    }
  }

  await deploy(["run"], { ...options, only }, { baseImage: newBaseImage ?? null });
}

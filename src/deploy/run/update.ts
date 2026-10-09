import { deploy } from "..";
import { FirebaseError } from "../../error";
import { RunSingle } from "../../firebaseConfig";
import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";
import {
  findServices,
  fullServiceName,
  getAllServiceConfigs,
  getExistingService,
  missingServiceMessage,
} from "./util";

/**
 * Updates a service's settings, then builds and deploys it like `firebase deploy` does. It always
 * rebuilds and deploys, even if the service already has those settings.
 * Changing the base image always needs a rebuild: images built for a base image leave out the
 * OS and runtime, and images built without one bring their own, which override the base image.
 * `name` is a service ID, or <serviceId>:<region> to pick one region of a service ID that
 * firebase.json lists in more than one.
 */
export async function updateService(name: string, options: Options): Promise<void> {
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
  const config = findServiceToUpdate(name, options);
  if (clearBaseImage && config.localBuild) {
    throw new FirebaseError(
      `Cannot clear the base image of ${config.serviceId}: local builds need one.`,
    );
  }
  if (!(await getExistingService(projectId, config.region, config.serviceId))) {
    throw new FirebaseError(`${missingServiceMessage(config)} Then you can update it.`);
  }

  await deploy(
    ["run"],
    { ...options, only: `run:${fullServiceName(config)}` },
    { baseImage: newBaseImage ?? null },
  );
}

/**
 * Returns the service in firebase.json that `name` refers to. Updates change one service at a
 * time, so if firebase.json lists the service ID in more than one region, `name` has to include
 * the region.
 */
function findServiceToUpdate(name: string, options: Options): RunSingle {
  const matches = findServices(getAllServiceConfigs(options), name);
  if (!matches.length) {
    throw new FirebaseError(`Cloud Run service ${name} not detected in firebase.json.`);
  }
  if (matches.length > 1) {
    const names = matches.map(fullServiceName);
    throw new FirebaseError(
      `${name} matches ${matches.length} services in firebase.json: ${names.join(", ")}. ` +
        `Run the command again with one of them, e.g. firebase run:services:update ${names[0]}`,
    );
  }
  return matches[0];
}

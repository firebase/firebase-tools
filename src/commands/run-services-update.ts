import { Command } from "../command";
import { TARGET_PERMISSIONS } from "../deploy";
import { updateService } from "../deploy/run/update";
import { Options } from "../options";
import { requireConfig } from "../requireConfig";
import { requirePermissions } from "../requirePermissions";

export const command = new Command("run:services:update <serviceId>")
  .description("update the settings of a Cloud Run service, then build and deploy it")
  .option(
    "--region <region>",
    "the service's region, if firebase.json lists the service ID in more than one region",
  )
  .option(
    "--base-image <baseImage>",
    "set the base image (e.g. nodejs22) and enable automatic base image updates",
  )
  .option("--clear-base-image", "clear the base image and disable automatic base image updates")
  .before(requireConfig)
  .before(requirePermissions, TARGET_PERMISSIONS.run)
  .action((serviceId: string, options: Options) =>
    updateService(serviceId, options.region as string | undefined, options),
  );

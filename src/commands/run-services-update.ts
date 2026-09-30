import { Command } from "../command";
import { TARGET_PERMISSIONS } from "../deploy";
import { updateService } from "../deploy/run/update";
import { Options } from "../options";
import { requireConfig } from "../requireConfig";
import { requirePermissions } from "../requirePermissions";

export const command = new Command("run:services:update")
  .description("update the settings of a Cloud Run service, then build and deploy it")
  .option("--service <serviceId>", "the ID of the service in firebase.json to update")
  .option(
    "--base-image <baseImage>",
    "set the base image (e.g. nodejs22) and enable automatic base image updates",
  )
  .option("--clear-base-image", "clear the base image and disable automatic base image updates")
  .option("--app <appId>", "associate a Firebase Web App ID for SDK auto-initialization")
  .option("--clear-app", "disassociate the Firebase Web App and disable SDK auto-initialization")
  .before(requireConfig)
  .before(requirePermissions, TARGET_PERMISSIONS.run)
  .action((options: Options) => updateService(options));

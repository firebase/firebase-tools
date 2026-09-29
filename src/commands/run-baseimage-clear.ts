import { Command } from "../command";
import { BASE_IMAGE_PERMISSIONS, setBaseImage } from "../deploy/run/baseImage";
import { Options } from "../options";
import { requireConfig } from "../requireConfig";
import { requirePermissions } from "../requirePermissions";

export const command = new Command("run:baseImage:clear")
  .alias("run:baseimage:clear")
  .description(
    "clear the base image of a Cloud Run service and disable automatic base image updates",
  )
  .option("--service <serviceId>", "the ID of the service in firebase.json to configure")
  .before(requireConfig)
  .before(requirePermissions, BASE_IMAGE_PERMISSIONS)
  .action((options: Options) => setBaseImage(options, null));

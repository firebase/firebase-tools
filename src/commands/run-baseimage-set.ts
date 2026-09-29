import { Command } from "../command";
import { BASE_IMAGE_PERMISSIONS, setBaseImage } from "../deploy/run/baseImage";
import { Options } from "../options";
import { requireConfig } from "../requireConfig";
import { requirePermissions } from "../requirePermissions";

export const command = new Command("run:baseImage:set <baseImage>")
  .alias("run:baseimage:set")
  .description(
    "set the base image (e.g. nodejs22) of a Cloud Run service and enable automatic base image updates",
  )
  .option("--service <serviceId>", "the ID of the service in firebase.json to configure")
  .before(requireConfig)
  .before(requirePermissions, BASE_IMAGE_PERMISSIONS)
  .action((baseImage: string, options: Options) => setBaseImage(options, baseImage));

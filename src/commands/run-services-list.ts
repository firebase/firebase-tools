import { Command } from "../command";
import { listRunServices } from "../deploy/run/list";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requirePermissions } from "../requirePermissions";

export const command = new Command("run:services:list")
  .description("list the Cloud Run services in your project, with their regions and base images")
  .before(requirePermissions, ["run.services.list"])
  .action((options: Options) => listRunServices(needProjectId(options)));

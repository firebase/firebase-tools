import * as yaml from "yaml";
import { Command } from "../command";
import { getServiceSpec } from "../deploy/run/get";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requirePermissions } from "../requirePermissions";

export const command = new Command("run:services:get <serviceId>")
  .description("print a Cloud Run service's YAML specification, like gcloud run services describe")
  .option(
    "--region <region>",
    "the service's region, if the project has a service with this ID in more than one region",
  )
  .before(requirePermissions, ["run.services.list", "run.services.get"])
  .action(async (serviceId: string, options: Options) => {
    const projectId = needProjectId(options);
    const service = await getServiceSpec(
      projectId,
      serviceId,
      options.region as string | undefined,
    );
    // A line width of 0 keeps long values, like JSON annotations, on one line.
    logger.info(yaml.stringify(service, { lineWidth: 0 }));
    return service;
  });

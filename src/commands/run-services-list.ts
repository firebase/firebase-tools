import * as Table from "cli-table3";
import { Command } from "../command";
import { isManagedByAnotherProduct, mainContainer, parseServiceName } from "../deploy/run/util";
import * as runv2 from "../gcp/runv2";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requirePermissions } from "../requirePermissions";
import { logBullet } from "../utils";

export const command = new Command("run:services:list")
  .description("list the Cloud Run services in your project, with their regions and base images")
  .before(requirePermissions, ["run.services.list"])
  .action((options: Options) => listRunServices(needProjectId(options)));

/**
 * Prints a table of the project's Cloud Run services, with each one's region and base image, and
 * returns them. Like `firebase init run`, it leaves out services that another product manages.
 */
export async function listRunServices(projectId: string): Promise<runv2.Service[]> {
  const allServices = await runv2.listServices(projectId, /* functionsOnly= */ false);
  const services = allServices.filter((s) => !isManagedByAnotherProduct(s));
  if (services.length) {
    const rows = services.map((service) => {
      const { serviceId, region } = parseServiceName(service.name);
      // Cloud Run stores the full base image URI, like
      // us-central1-docker.pkg.dev/serverless-runtimes/google-22/runtimes/nodejs22. Show its last
      // part, the name users pass to --base-image. A service without a base image doesn't get
      // automatic base image updates.
      const baseImage = mainContainer(service.template)?.baseImageUri;
      return [serviceId, region, baseImage ? baseImage.split("/").pop() || baseImage : "None"];
    });
    rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    const table = new Table({
      head: ["Service ID", "Region", "Base Image"],
      style: { head: ["green"] },
    });
    for (const row of rows) {
      table.push(row);
    }
    logger.info(table.toString());
  } else {
    logger.info(`No Cloud Run services found in project ${projectId}.`);
  }
  const skipped = allServices.length - services.length;
  if (skipped) {
    logBullet(
      `Not listed: ${skipped} ${skipped === 1 ? "service" : "services"} that another product, ` +
        `like Cloud Functions or App Hosting, manages.`,
    );
  }
  return services;
}

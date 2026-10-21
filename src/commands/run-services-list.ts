import * as Table from "cli-table3";
import { Command } from "../command";
import { mainContainer, parseServiceName } from "../deploy/run/util";
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
 * returns them.
 */
export async function listRunServices(projectId: string): Promise<runv2.Service[]> {
  const allServices = await runv2.listServices(projectId, /* functionsOnly= */ false);
  // Like `firebase init run`, skip services that another product (e.g. Cloud Functions or App
  // Hosting) manages.
  const services = allServices.filter((s) => !s.labels?.[runv2.CLIENT_NAME_LABEL]);
  if (services.length) {
    const rows = services.map((service) => {
      const { serviceId, region } = parseServiceName(service.name);
      // Cloud Run stores the base image's full URI. Show its last part, like nodejs22, which is
      // what users pass to --base-image.
      const baseImage = mainContainer(service.template)?.baseImageUri?.split("/").pop();
      return [serviceId, region, baseImage || "None"];
    });
    rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    const table = new Table({
      head: ["Service ID", "Region", "Base Image"],
      style: { head: ["green"] },
    });
    table.push(...rows);
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

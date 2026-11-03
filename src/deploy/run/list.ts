import * as Table from "cli-table3";
import * as runv2 from "../../gcp/runv2";
import { logger } from "../../logger";
import { logBullet } from "../../utils";
import { isManagedByAnotherProduct, mainContainer, parseServiceName } from "./util";

/**
 * Prints a table of the project's Cloud Run services and returns them. Like `firebase init run`,
 * it leaves out services that another product manages.
 */
export async function listRunServices(projectId: string): Promise<runv2.Service[]> {
  const allServices = await runv2.listServices(projectId, /* functionsOnly= */ false);
  const services = allServices.filter((s) => !isManagedByAnotherProduct(s));
  if (services.length) {
    const table = new Table({
      head: ["Service ID", "Region", "Base Image"],
      style: { head: ["green"] },
    });
    table.push(...serviceRows(services));
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

/** Returns each service's ID, region, and base image, sorted by ID. */
export function serviceRows(services: runv2.Service[]): string[][] {
  const rows = services.map((service) => {
    const { serviceId, region } = parseServiceName(service.name);
    // Cloud Run stores the base image's full URI. Show its last part, like nodejs22, which is
    // what users pass to --base-image.
    const baseImage = mainContainer(service.template)?.baseImageUri?.split("/").pop();
    return [serviceId, region, baseImage || "None"];
  });
  return rows.sort(
    ([idA, regionA], [idB, regionB]) => idA.localeCompare(idB) || regionA.localeCompare(regionB),
  );
}

import { Options } from "../../options";
import * as client from "../../dataconnect/client";
import * as utils from "../../utils";
import { Service, ServiceInfo } from "../../dataconnect/types";
import { FirebaseError } from "../../error";

/**
 * Checks for and creates a Firebase DataConnect service, if needed.
 * TODO: Also checks for and creates a CloudSQL instance and database.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
export default async function (
  context: { dataconnect: ServiceInfo[] },
  options: Options,
): Promise<void> {
  if (!options.projectId) {
    throw new FirebaseError("Dataconnect: No project specifed.");
  }
  const services = await client.listAllServices(options.projectId);
  const servicesToCreate = context.dataconnect.filter(
    (si) => !services.some((s) => matches(si, s)),
  );
  const servicesToDelete = services.filter(
    (s) => !context.dataconnect.some((si) => matches(si, s)),
  );

  let promises: Promise<any>[] = [];
  promises = promises.concat(
    servicesToCreate.map(async (s) => {
      const { projectId, locationId, serviceId } = splitName(s.serviceName);
      await client.createService(projectId, locationId, serviceId);
      utils.logLabeledSuccess("dataconnect", `Created service ${s.serviceName}`);
    }),
  );
  promises = promises.concat(
    servicesToDelete.map(async (s) => {
      // TODO: Prompt before deletion, displaying info about child resources on the service
      const { projectId, locationId, serviceId } = splitName(s.name);
      await client.deleteService(projectId, locationId, serviceId);
      utils.logLabeledSuccess("dataconnect", `Deleted service ${s.name}`);
    }),
  );
  await Promise.all(promises);
  return;
}

function matches(si: ServiceInfo, s: Service) {
  return si.serviceName === s.name;
}

function splitName(serviceName: string): {
  projectId: string;
  locationId: string;
  serviceId: string;
} {
  const parts = serviceName.split("/");
  return {
    projectId: parts[1],
    locationId: parts[3],
    serviceId: parts[5],
  };
}

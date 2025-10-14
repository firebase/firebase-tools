import { Options } from "../../options";
import * as client from "../../dataconnect/client";
import * as utils from "../../utils";
import { Service, ServiceInfo, requiresVector, DeployStats } from "../../dataconnect/types";
import { needProjectId } from "../../projectUtils";
import { setupCloudSql } from "../../dataconnect/provisionCloudSql";
import { parseServiceName } from "../../dataconnect/names";
import { ResourceFilter } from "../../dataconnect/filters";
import { vertexAIOrigin } from "../../api";
import * as ensureApiEnabled from "../../ensureApiEnabled";
import { confirm } from "../../prompt";
import { Context } from "mocha";

/**
 * Checks for and creates a Firebase DataConnect service, if needed.
 * TODO: Also checks for and creates a CloudSQL instance and database.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
export default async function (context: Context, options: Options): Promise<void> {
  const projectId = needProjectId(options);
  const serviceInfos = context.dataconnect.serviceInfos as ServiceInfo[];
  const services = await client.listAllServices(projectId);
  const filters = context.dataconnect.filters;

  if (
    serviceInfos.some((si) => {
      return requiresVector(si.deploymentMetadata);
    })
  ) {
    await ensureApiEnabled.ensure(projectId, vertexAIOrigin(), "dataconnect");
  }

  const servicesToCreate = serviceInfos
    .filter((si) => !services.some((s) => matches(si, s)))
    .filter((si) => {
      return !filters || filters?.some((f) => si.dataConnectYaml.serviceId === f.serviceId);
    });
  context.dataconnect.deployStats.num_service_created = servicesToCreate.length;

  const servicesToDelete = filters
    ? []
    : services.filter((s) => !serviceInfos.some((si) => matches(si, s)));
  context.dataconnect.deployStats.num_service_deleted = servicesToDelete.length;
  await Promise.all(
    servicesToCreate.map(async (s) => {
      const { projectId, locationId, serviceId } = splitName(s.serviceName);
      await client.createService(projectId, locationId, serviceId);
      utils.logLabeledSuccess("dataconnect", `Created service ${s.serviceName}`);
    }),
  );

  if (servicesToDelete.length) {
    const serviceToDeleteList = servicesToDelete.map((s) => " - " + s.name).join("\n");
    if (
      await confirm({
        force: false, // Don't delete anything in --force.
        nonInteractive: options.nonInteractive,
        message: `The following services exist on ${projectId} but are not listed in your 'firebase.json'\n${serviceToDeleteList}\nWould you like to delete these services?`,
        default: false,
      })
    ) {
      await Promise.all(
        servicesToDelete.map(async (s) => {
          await client.deleteService(s.name);
          utils.logLabeledSuccess("dataconnect", `Deleted service ${s.name}`);
        }),
      );
    }
  }

  // Provision CloudSQL resources
  utils.logLabeledBullet("dataconnect", "Checking for CloudSQL resources...");

  await Promise.all(
    serviceInfos
      .filter((si) => {
        return !filters || filters?.some((f) => si.dataConnectYaml.serviceId === f.serviceId);
      })
      .map(async (s) => {
        const postgresDatasource = s.schema.datasources.find((d) => d.postgresql);
        if (postgresDatasource) {
          const instanceId = postgresDatasource.postgresql?.cloudSql?.instance.split("/").pop();
          const databaseId = postgresDatasource.postgresql?.database;
          if (!instanceId || !databaseId) {
            return Promise.resolve();
          }
          return setupCloudSql({
            projectId,
            location: parseServiceName(s.serviceName).location,
            instanceId,
            databaseId,
            requireGoogleMlIntegration: requiresVector(s.deploymentMetadata),
          });
        }
      }),
  );
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

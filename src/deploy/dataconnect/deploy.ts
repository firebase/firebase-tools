import { Options } from "../../options";
import * as client from "../../dataconnect/client";
import * as utils from "../../utils";
import { Service, ServiceInfo, requiresVector } from "../../dataconnect/types";
import { needProjectId } from "../../projectUtils";
import { provisionCloudSql } from "../../dataconnect/provisionCloudSql";
import { parseServiceName } from "../../dataconnect/names";
import { ResourceFilter } from "../../dataconnect/filters";
import { vertexAIOrigin } from "../../api";
import * as ensureApiEnabled from "../../ensureApiEnabled";
import { confirm } from "../../prompt";

/**
 * Checks for and creates a Firebase DataConnect service, if needed.
 * TODO: Also checks for and creates a CloudSQL instance and database.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
export default async function (
  context: {
    dataconnect: {
      serviceInfos: ServiceInfo[];
      filters?: ResourceFilter[];
    };
  },
  options: Options,
): Promise<void> {
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
  // When --only filters are passed, don't delete anything.
  const servicesToDelete = filters
    ? []
    : services.filter((s) => !serviceInfos.some((si) => matches(si, s)));
  await Promise.all(
    servicesToCreate.map(async (s) => {
      const { projectId, locationId, serviceId } = splitName(s.serviceName);
      await client.createService(projectId, locationId, serviceId);
      utils.logLabeledSuccess("dataconnect", `Created service ${s.serviceName}`);
    }),
  );

  if (servicesToDelete.length) {
    if (
      await confirm({
        force: options.force,
        nonInteractive: options.nonInteractive,
        message: `The following services exist on ${projectId} but are not listed in your 'firebase.json'\n${servicesToDelete
          .map((s) => s.name)
          .join("\n")}\nWould you like to delete these services?`,
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
          const instanceId = postgresDatasource.postgresql?.cloudSql.instance.split("/").pop();
          const databaseId = postgresDatasource.postgresql?.database;
          if (!instanceId || !databaseId) {
            return Promise.resolve();
          }
          const enableGoogleMlIntegration = requiresVector(s.deploymentMetadata);
          return provisionCloudSql({
            projectId,
            location: parseServiceName(s.serviceName).location,
            instanceId,
            databaseId,
            enableGoogleMlIntegration,
            waitForCreation: true,
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

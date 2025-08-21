import * as utils from "../../utils";
import { Connector, ServiceInfo } from "../../dataconnect/types";
import { listConnectors, upsertConnector } from "../../dataconnect/client";
import { promptDeleteConnector } from "../../dataconnect/prompts";
import { Options } from "../../options";
import { ResourceFilter } from "../../dataconnect/filters";
import { migrateSchema } from "../../dataconnect/schemaMigration";
import { needProjectId } from "../../projectUtils";
import { parseServiceName } from "../../dataconnect/names";
import { logger } from "../../logger";

/**
 * Release deploys schemas and connectors.
 * TODO: Also prompt user to delete unused schemas/connectors
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
  const project = needProjectId(options);
  const serviceInfos = context.dataconnect.serviceInfos;
  const filters = context.dataconnect.filters;

  // First, figure out the schemas and connectors to deploy.
  const wantSchemas = serviceInfos
    .filter((si) => {
      return (
        !filters ||
        filters.some((f) => {
          return f.serviceId === si.dataConnectYaml.serviceId && (f.schemaOnly || f.fullService);
        })
      );
    })
    .map((s) => ({
      schema: s.schema,
      validationMode: s.dataConnectYaml?.schema?.datasource?.postgresql?.schemaValidation,
    }));
  const wantConnectors = serviceInfos.flatMap((si) =>
    si.connectorInfo
      .filter((c) => {
        return (
          !filters ||
          filters.some((f) => {
            return (
              f.serviceId === si.dataConnectYaml.serviceId &&
              (f.connectorId === c.connectorYaml.connectorId || f.fullService)
            );
          })
        );
      })
      .map((c) => c.connector),
  );

  // First, try to deploy all connectors on the previous schema.
  // If the connector relies on fields in the new schema, they will fail.
  // Those remaining connectors will be deployed after schema migration.
  const attemptedConnectors = await Promise.all(
    wantConnectors.map(async (c) => {
      try {
        await upsertConnector(c);
      } catch (err: any) {
        logger.debug("Error pre-deploying connector", c.name, err);
        return c;
      }
      utils.logLabeledSuccess("dataconnect", `Deployed connector ${c.name}`);
      return undefined;
    }),
  );

  // First, migrate and deploy schemas
  for (const s of wantSchemas) {
    await migrateSchema({
      options,
      schema: s.schema,
      validateOnly: false,
      schemaValidation: s.validationMode,
    });
    utils.logLabeledSuccess("dataconnect", `Migrated schema ${s.schema.name}`);
  }

  // Next, deploy remaining connectors.
  await Promise.all(
    attemptedConnectors.map(async (c) => {
      if (c) {
        await upsertConnector(c);
        utils.logLabeledSuccess("dataconnect", `Deployed connector ${c.name}`);
      }
    }),
  );

  // Check for unknown connectors.
  const allConnectors = await deployedConnectors(serviceInfos);
  const connectorsToDelete = filters
    ? []
    : allConnectors.filter((h) => !wantConnectors.some((w) => w.name === h.name));
  for (const c of connectorsToDelete) {
    await promptDeleteConnector(options, c.name);
  }

  let consolePath = "/dataconnect";
  if (serviceInfos.length === 1) {
    const sn = parseServiceName(serviceInfos[0].serviceName);
    consolePath += `/locations/${sn.location}/services/${sn.serviceId}/schema`;
  }
  utils.logLabeledSuccess(
    "dataconnect",
    `Deployment complete! View your deployed schema and connectors at

    ${utils.consoleUrl(project, consolePath)}
`,
  );
  return;
}

// deployedConnectors lists out all of the connectors currently deployed to the services we are deploying.
// We don't need to worry about connectors on other services because we will delete/ignore the service during deploy
async function deployedConnectors(serviceInfos: ServiceInfo[]): Promise<Connector[]> {
  let connectors: Connector[] = [];
  for (const si of serviceInfos) {
    connectors = connectors.concat(await listConnectors(si.serviceName));
  }
  return connectors;
}

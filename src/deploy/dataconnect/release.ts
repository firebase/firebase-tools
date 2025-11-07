import * as utils from "../../utils";
import { Connector, mainSchema, ServiceInfo } from "../../dataconnect/types";
import { listConnectors, upsertConnector } from "../../dataconnect/client";
import { promptDeleteConnector } from "../../dataconnect/prompts";
import { Options } from "../../options";
import { migrateSchema } from "../../dataconnect/schemaMigration";
import { needProjectId } from "../../projectUtils";
import { parseServiceName } from "../../dataconnect/names";
import { logger } from "../../logger";
import { Context } from "./context";

/**
 * Release deploys schemas and connectors.
 * TODO: Also prompt user to delete unused schemas/connectors
 * @param context The deploy context.
 * @param options The CLI options object.
 */
export default async function (context: Context, options: Options): Promise<void> {
  const dataconnect = context.dataconnect;
  if (!dataconnect) {
    throw new Error("dataconnect.prepare must be run before dataconnect.release");
  }
  const project = needProjectId(options);
  const serviceInfos = dataconnect.serviceInfos;
  const filters = dataconnect.filters;

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
      schema: mainSchema(s),
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

  // Pre-deploy all connectors on the previous schema.
  // If connectors don't rely on capabilities in the new schema, they will succeed.
  // The remaining connectors will be deployed after schema migration.
  const remainingConnectors = await Promise.all(
    wantConnectors.map(async (c) => {
      try {
        await upsertConnector(c);
      } catch (err: any) {
        logger.debug("Error pre-deploying connector", c.name, err);
        return c; // will try again after schema deployment.
      }
      utils.logLabeledSuccess("dataconnect", `Deployed connector ${c.name}`);
      dataconnect.deployStats.numConnectorUpdatedBeforeSchema++;
      return undefined;
    }),
  );

  // Migrate schemas.
  for (const s of wantSchemas) {
    await migrateSchema({
      options,
      schema: s.schema,
      validateOnly: false,
      schemaValidation: s.validationMode,
      stats: dataconnect.deployStats,
    });
    utils.logLabeledSuccess("dataconnect", `Migrated schema ${s.schema.name}`);
    dataconnect.deployStats.numSchemaMigrated++;
  }

  // Lastly, deploy the remaining connectors that relies on the latest schema.
  await Promise.all(
    remainingConnectors.map(async (c) => {
      if (c) {
        await upsertConnector(c);
        utils.logLabeledSuccess("dataconnect", `Deployed connector ${c.name}`);
        dataconnect.deployStats.numConnectorUpdatedAfterSchema++;
      }
    }),
  );

  // In the end, check for connectors not tracked in local repositories.
  const allConnectors = await deployedConnectors(serviceInfos);
  const connectorsToDelete = filters
    ? []
    : allConnectors.filter((h) => !wantConnectors.some((w) => w.name === h.name));
  for (const c of connectorsToDelete) {
    await promptDeleteConnector(options, c.name);
  }

  // Print the Console link.
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

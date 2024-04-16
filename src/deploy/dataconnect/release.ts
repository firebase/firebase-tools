import * as utils from "../../utils";
import { Connector, ServiceInfo } from "../../dataconnect/types";
import { listConnectors, upsertSchema, upsertConnector } from "../../dataconnect/client";
import { promptDeleteConnector } from "../../dataconnect/prompts";
import { Options } from "../../options";
import { FirebaseError } from "../../error";
import { ResourceFilter } from "../../dataconnect/filters";
import { migrateSchema } from "../../dataconnect/schemaMigration";

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
  const serviceInfos = context.dataconnect.serviceInfos;
  const filters = context.dataconnect.filters;

  // First, migrate and deploy schemas
  const wantSchemas = serviceInfos
    .filter((si) => {
      return (
        !filters ||
        filters.some((f) => {
          return f.serviceId === si.dataConnectYaml.serviceId && (f.schemaOnly || f.fullService);
        })
      );
    })
    .map((s) => s.schema);

  if (wantSchemas.length) {
    // If needed, migrate schemas
    utils.logLabeledBullet(
      "dataconnect",
      "Checking if database schemas match Data Connect schemas...",
    );
    for (const s of wantSchemas) {
      await migrateSchema(options, s, /** allowNonInteractiveMigration=*/ false);
    }
    // Then, deploy schemas
    utils.logLabeledBullet("dataconnect", "Releasing schemas...");
    const schemaPromises = await Promise.allSettled(wantSchemas.map((s) => upsertSchema(s)));
    const failedSchemas = schemaPromises.filter(
      (p): p is PromiseRejectedResult => p.status === "rejected",
    );
    if (failedSchemas.length) {
      throw new FirebaseError(
        `Errors while updating your schemas:\n ${failedSchemas.map((f) => f.reason).join("\n")}`,
      );
    }
    utils.logLabeledBullet("dataconnect", "Schemas released.");
  }

  // Next, deploy connectors
  let wantConnectors: Connector[] = [];
  wantConnectors = wantConnectors.concat(
    ...serviceInfos.map((si) =>
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
    ),
  );
  const haveConnectors = await have(serviceInfos);
  const connectorsToDelete = filters
    ? []
    : haveConnectors.filter((h) => !wantConnectors.some((w) => w.name === h.name));

  if (wantConnectors.length) {
    utils.logLabeledBullet("dataconnect", "Releasing connectors...");
    await Promise.all(
      wantConnectors.map(async (c) => {
        await upsertConnector(c);
        utils.logLabeledSuccess("dataconnect", `Deployed connector ${c.name}`);
      }),
    );
    for (const c of connectorsToDelete) {
      await promptDeleteConnector(options, c.name);
    }
    utils.logLabeledBullet("dataconnect", "Connectors released.");
  }
  utils.logLabeledSuccess("dataconnect", "Deploy complete!");
  return;
}

// have lists out all of the connectors currently deployed to the services we are deploying.
// We don't need to worry about connectors on other services because we will delete/ignore the service during deploy
async function have(serviceInfos: ServiceInfo[]): Promise<Connector[]> {
  let connectors: Connector[] = [];
  for (const si of serviceInfos) {
    connectors = connectors.concat(await listConnectors(si.serviceName));
  }
  return connectors;
}

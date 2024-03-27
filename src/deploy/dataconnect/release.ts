import * as utils from "../../utils";
import { Connector, ServiceInfo } from "../../dataconnect/types";
import { listConnectors, upsertSchema, upsertConnector } from "../../dataconnect/client";
import { promptDeleteConnector } from "../../dataconnect/prompts";
import { Options } from "../../options";
import { FirebaseError } from "../../error";

/**
 * Release deploys schemas and connectors.
 * TODO: Also prompt user to delete unused schemas/connectors
 * @param context The deploy context.
 * @param options The CLI options object.
 */
export default async function (context: any, options: Options): Promise<void> {
  const serviceInfos = context.dataconnect as ServiceInfo[];
  const wantSchemas = serviceInfos.map((s) => s.schema);
  let wantConnectors: Connector[] = [];
  wantConnectors = wantConnectors.concat(
    ...serviceInfos.map((s) => s.connectorInfo.map((c) => c.connector)),
  );
  const haveConnectors = await have(serviceInfos);
  const connectorsToDelete = haveConnectors.filter(
    (h) => !wantConnectors.some((w) => w.name === h.name),
  );

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

  utils.logLabeledBullet("dataconnect", "Releasing connectors...");
  await Promise.all(wantConnectors.map((c) => upsertConnector(c)));
  for (const c of connectorsToDelete) {
    await promptDeleteConnector(options, c.name);
  }
  utils.logLabeledBullet("dataconnect", "Connectors released.");
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

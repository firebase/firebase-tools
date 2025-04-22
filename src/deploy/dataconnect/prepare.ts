import * as clc from "colorette";

import { DeployOptions } from "../";
import { load } from "../../dataconnect/load";
import { readFirebaseJson } from "../../dataconnect/fileUtils";
import { logger } from "../../logger";
import * as utils from "../../utils";
import { needProjectId } from "../../projectUtils";
import { getResourceFilters, toString } from "../../dataconnect/filters";
import { build } from "../../dataconnect/build";
import { ensureApis } from "../../dataconnect/ensureApis";
import { requireTosAcceptance } from "../../requireTosAcceptance";
import { DATA_CONNECT_TOS_ID } from "../../gcp/firedata";
import { provisionCloudSql } from "../../dataconnect/provisionCloudSql";
import { checkBillingEnabled } from "../../gcp/cloudbilling";
import { parseServiceName } from "../../dataconnect/names";
import { FirebaseError } from "../../error";
import { requiresVector } from "../../dataconnect/types";
import { diffSchema } from "../../dataconnect/schemaMigration";
import { upgradeInstructions } from "../../dataconnect/freeTrial";

/**
 * Prepares for a Firebase DataConnect deployment by loading schemas and connectors from file.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
export default async function (context: any, options: DeployOptions): Promise<void> {
  const projectId = needProjectId(options);
  if (!(await checkBillingEnabled(projectId))) {
    throw new FirebaseError(upgradeInstructions(projectId));
  }
  await ensureApis(projectId);
  await requireTosAcceptance(DATA_CONNECT_TOS_ID)(options);
  const serviceCfgs = readFirebaseJson(options.config);
  utils.logLabeledBullet("dataconnect", `Preparing to deploy`);
  const filters = getResourceFilters(options);
  const serviceInfos = await Promise.all(
    serviceCfgs.map((c) => load(projectId, options.config, c.source)),
  );
  for (const si of serviceInfos) {
    si.deploymentMetadata = await build(options, si.sourceDirectory, options.dryRun);
  }
  const unmatchedFilters = filters?.filter((f) => {
    // filter out all filters that match no service
    const serviceMatched = serviceInfos.some((s) => s.dataConnectYaml.serviceId === f.serviceId);
    const connectorMatched = f.connectorId
      ? serviceInfos.some((s) => {
          return (
            s.dataConnectYaml.serviceId === f.serviceId &&
            s.connectorInfo.some((c) => c.connectorYaml.connectorId === f.connectorId)
          );
        })
      : true;
    return !serviceMatched || !connectorMatched;
  });
  if (unmatchedFilters?.length) {
    throw new FirebaseError(
      `The following filters were specified in --only but didn't match anything in this project: ${unmatchedFilters.map(toString).map(clc.bold).join(", ")}`,
    );
    // TODO: Did you mean?
  }
  context.dataconnect = {
    serviceInfos,
    filters,
  };
  utils.logLabeledBullet("dataconnect", `Successfully prepared schema and connectors`);
  if (options.dryRun) {
    for (const si of serviceInfos) {
      await diffSchema(
        options,
        si.schema,
        si.dataConnectYaml.schema.datasource.postgresql?.schemaValidation,
      );
    }
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
              dryRun: options.dryRun,
            });
          }
        }),
    );
  }
  logger.debug(JSON.stringify(context.dataconnect, null, 2));
  return;
}

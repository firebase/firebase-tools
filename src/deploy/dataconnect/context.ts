import { DeployOptions } from "..";
import { ResourceFilter } from "../../dataconnect/filters";
import { ServiceInfo, WarningLevel } from "../../dataconnect/types";
import { AnalyticsParams, trackGA4 } from "../../track";

export interface Context {
  dataconnect?: {
    serviceInfos: ServiceInfo[];
    filters?: ResourceFilter[];
    deployStats: DeployStats;
  };
}

export interface DeployStats {
  options?: DeployOptions;

  // prepare.ts
  abortDueToMissingBilling?: boolean;
  numBuildErrors: Map<WarningLevel | "ERROR", number>;

  // deploy.ts
  numServiceCreated: number;
  numServiceDeleted: number;

  // release.ts
  numSchemaMigrated: number;
  numConnectorUpdatedBeforeSchema: number;
  numConnectorUpdatedAfterSchema: number;

  // migrateSchema.ts
  numSchemaSkippedDueToPendingCreate: number;
  numSqlSchemaDiffs: number;
  numInvalidConnectors: number;
}

/**
 *
 */
export function initDeployStats(options?: DeployOptions): DeployStats {
  return {
    options: options,
    numBuildErrors: new Map<WarningLevel | "ERROR", number>(),
    numServiceCreated: 0,
    numServiceDeleted: 0,
    numSchemaMigrated: 0,
    numConnectorUpdatedBeforeSchema: 0,
    numConnectorUpdatedAfterSchema: 0,
    numSchemaSkippedDueToPendingCreate: 0,
    numSqlSchemaDiffs: 0,
    numInvalidConnectors: 0,
  };
}

export async function trackDeployStats(stats: DeployStats): Promise<void> {
  const params: AnalyticsParams = {
    force: (!!stats.options?.force).toString(),
    dryRun: (!!stats.options?.dryRun).toString(),
    interactive: (!stats.options?.nonInteractive).toString(),
    abortDueToMissingBilling: (!!stats.abortDueToMissingBilling).toString(),
    numServiceCreated: stats.numServiceCreated,
    numServiceDeleted: stats.numServiceDeleted,
    numSchemaMigrated: stats.numSchemaMigrated,
    numConnectorUpdatedBeforeSchema: stats.numConnectorUpdatedBeforeSchema,
    numConnectorUpdatedAfterSchema: stats.numConnectorUpdatedAfterSchema,
    numSchemaSkippedDueToPendingCreate: stats.numSchemaSkippedDueToPendingCreate,
    numSchemaWithIncompatibleSchema: stats.numSqlSchemaDiffs,
    numSchemaWithInvalidConnector: stats.numInvalidConnectors,
    num_build_errors: JSON.stringify(Object.fromEntries(stats.numBuildErrors)),
  };
  console.log("stats", params);
  await trackGA4("dataconnect_deploy", params);
}

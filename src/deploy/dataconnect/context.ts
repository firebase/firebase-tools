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
  missingBilling?: boolean;
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
    dry_run: (!!stats.options?.dryRun).toString(),
    interactive: (!stats.options?.nonInteractive).toString(),
    missing_billing: (!!stats.missingBilling).toString(),
    num_service_created: stats.numServiceCreated,
    num_service_deleted: stats.numServiceDeleted,
    num_schema_migrated: stats.numSchemaMigrated,
    num_connector_updated_before_schema: stats.numConnectorUpdatedBeforeSchema,
    num_connector_updated_after_schema: stats.numConnectorUpdatedAfterSchema,
    num_schema_skipped_due_to_pending_create: stats.numSchemaSkippedDueToPendingCreate,
    num_schema_with_incompatible_schema: stats.numSqlSchemaDiffs,
    num_schema_with_invalid_connector: stats.numInvalidConnectors,
    num_build_errors: JSON.stringify(Object.fromEntries(stats.numBuildErrors)),
  };
  await trackGA4("dataconnect_deploy", params);
}

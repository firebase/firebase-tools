import { ResourceFilter } from "../../dataconnect/filters";
import { ServiceInfo } from "../../dataconnect/types";
import { AnalyticsParams } from "../../track";

export interface Context {
  dataconnect?: {
    serviceInfos: ServiceInfo[];
    filters?: ResourceFilter[];
    deployStats: DeployStats;
  };
}

export interface DeployStats {
  // prepare.ts
  missingBilling?: boolean;
  numBuildErrors: number;
  numBuildWarnings: Map<string, number>;

  // deploy.ts
  numServiceCreated: number;
  numServiceDeleted: number;

  // release.ts
  numSchemaMigrated: number;
  numConnectorUpdatedBeforeSchema: number;
  numConnectorUpdatedAfterSchema: number;

  // migrateSchema.ts
  numSchemaSkippedDueToPendingCreate: number;
  numSchemaSqlDiffs: number;
  numSchemaInvalidConnectors: number;
}

export function initDeployStats(): DeployStats {
  return {
    numBuildErrors: 0,
    numBuildWarnings: new Map<string, number>(),
    numServiceCreated: 0,
    numServiceDeleted: 0,
    numSchemaMigrated: 0,
    numConnectorUpdatedBeforeSchema: 0,
    numConnectorUpdatedAfterSchema: 0,
    numSchemaSkippedDueToPendingCreate: 0,
    numSchemaSqlDiffs: 0,
    numSchemaInvalidConnectors: 0,
  };
}

export function deployStatsParams(stats: DeployStats): AnalyticsParams {
  const buildWarnings: AnalyticsParams = {};
  for (const [type, num] of stats.numBuildWarnings.entries()) {
    buildWarnings[`num_build_warnings_${type}`] = num;
  }
  return {
    missing_billing: (!!stats.missingBilling).toString(),
    num_service_created: stats.numServiceCreated,
    num_service_deleted: stats.numServiceDeleted,
    num_schema_migrated: stats.numSchemaMigrated,
    num_connector_updated_before_schema: stats.numConnectorUpdatedBeforeSchema,
    num_connector_updated_after_schema: stats.numConnectorUpdatedAfterSchema,
    num_schema_skipped_due_to_pending_create: stats.numSchemaSkippedDueToPendingCreate,
    num_schema_sql_diffs: stats.numSchemaSqlDiffs,
    num_schema_invalid_connectors: stats.numSchemaInvalidConnectors,
    num_build_errors: stats.numBuildErrors,
    ...buildWarnings,
  };
}

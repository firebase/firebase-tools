import { ResourceFilter } from "../../dataconnect/filters";
import { ServiceInfo, WarningLevel } from "../../dataconnect/types";

export interface Context {
  dataconnect?: {
    serviceInfos: ServiceInfo[];
    filters?: ResourceFilter[];
    deployStats: DeployStats;
  };
}

export interface DeployStats {
  force: boolean;
  dryRun: boolean;

  // prepare.ts
  abortMissingBilling?: boolean;
  numBuildErrors: Map<WarningLevel | "ERROR", number>;

  // deploy.ts
  numServiceCreated: number;
  numServiceDeleted: number;

  // release.ts
  numSchemaMigrated: number;
  numConnectorUpdatedBeforeSchema: number;
  numConnectorUpdatedAfterSchema: number;

  // migrateSchema.ts
  skipPendingCreate?: string;
  abortSchemaMigration?: string;
  completedSchemaMigration?: string;
  abortInvalidConnector?: string;
  deleteInvalidConnector?: string;
}

export function initDeployStats(force?: boolean, dryRun?: boolean): DeployStats {
  return {
    force: !!force,
    dryRun: !!dryRun,
    numBuildErrors: new Map<WarningLevel | "ERROR", number>(),
    numServiceCreated: 0,
    numServiceDeleted: 0,
    numSchemaMigrated: 0,
    numConnectorUpdatedBeforeSchema: 0,
    numConnectorUpdatedAfterSchema: 0,
  };
}

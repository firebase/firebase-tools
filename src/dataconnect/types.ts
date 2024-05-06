// Schema is a singleton, so we always call it 'main'
export const SCHEMA_ID = "main";

// API Types
interface BaseResource {
  createTime?: string;
  updateTime?: string;
  uid?: string;
  reconciling?: boolean;
}

export interface Service extends BaseResource {
  name: string;
}

export interface Schema extends BaseResource {
  name: string;

  primaryDatasource: Datasource;
  source: Source;
}

export interface Connector extends BaseResource {
  name: string;
  source: Source;
}

export interface Datasource {
  postgresql?: PostgreSql;
}

export interface PostgreSql {
  database: string;
  cloudSql: CloudSqlInstance;
  schemaValidation?: "STRICT" | "NONE" | "SQL_SCHEMA_VALIDATION_UNSPECIFIED";
}

export interface CloudSqlInstance {
  instance: string;
}

export interface Source {
  files: File[];
}

export interface File {
  path: string;
  content: string;
}

// An error indicating that the SQL database schema is incomptible with a data connect schema.
export interface IncompatibleSqlSchemaError {
  // A list of differences between the two schema with instrucitons how to resolve them.
  diffs: Diff[];
  // Whether any of the changes included are destructive.
  destructive: boolean;
}

export interface Diff {
  // A SQL migration command (i.e. `CREATE TABLE …`, etc.) that should be run in order to bring
  // the underlying SQL schema in line with the GQL application schema.
  sql: string;
  // A description of the changes to be applied with sql_migration_command.
  description: string;
  // Whether the SQL migration command is destructive.
  destructive: boolean;
}

export interface GraphqlError {
  message: string;
  locations: {
    line: number;
    column: number;
  }[];
  extensions: {
    file?: string;
    [key: string]: any;
  };
}
export interface BuildResult {
  errors?: GraphqlError[];
  metadata?: DeploymentMetadata;
}

export interface DeploymentMetadata {
  primaryDataSource?: {
    postgres?: {
      requiredExtensions?: string[];
    };
  };
}

export function requiresVector(dm?: DeploymentMetadata): boolean {
  return dm?.primaryDataSource?.postgres?.requiredExtensions?.includes("vector") ?? false;
}

// YAML types
export interface DataConnectYaml {
  specVersion?: string;
  serviceId: string;
  schema: SchemaYaml;
  connectorDirs: string[];
}

export interface SchemaYaml {
  source: string;
  datasource: DatasourceYaml;
}

export interface DatasourceYaml {
  postgresql?: {
    database: string;
    cloudSql: {
      instanceId: string;
    };
  };
}

export interface ConnectorYaml {
  connectorId: string;
  authMode?: "ADMIN" | "PUBLIC";
  generate?: Generate;
}

export interface Generate {
  javascriptSdk?: JavascriptSDK[];
  swiftSdk?: SwiftSDK[];
  kotlinSdk?: KotlinSDK[];
}

export interface JavascriptSDK {
  outputDir: string;
}
export interface SwiftSDK {
  // Optional for Swift becasue XCode makes you import files.
  outputDir?: string;
}
export interface KotlinSDK {
  outputDir: string;
}

// Helper types && converters
export interface ServiceInfo {
  serviceName: string;
  sourceDirectory: string;
  schema: Schema;
  connectorInfo: {
    connector: Connector;
    connectorYaml: ConnectorYaml;
  }[];
  dataConnectYaml: DataConnectYaml;
  deploymentMetadata?: DeploymentMetadata;
}

export function toDatasource(
  projectId: string,
  locationId: string,
  ds: DatasourceYaml,
): Datasource {
  if (ds.postgresql) {
    return {
      postgresql: {
        database: ds.postgresql.database,
        cloudSql: {
          instance: `projects/${projectId}/locations/${locationId}/instances/${ds.postgresql.cloudSql.instanceId}`,
        },
      },
    };
  }
  return {};
}

/** Start Dataplane Client Types */
export interface ExecuteGraphqlRequest {
  name: string;
  query: string;
  operationName?: string;
  variables?: { [key: string]: string };
  extensions?: { impersonate?: Impersonation };
}

export interface ExecuteGraphqlResponse {
  data: Record<string, any>;
  errors: any[];
}

export interface ExecuteGraphqlResponseError {
  error: { code: number; message: string; status: string; details: any[] };
}

interface ImpersonationAuthenticated {
  authClaims: any;
}
interface ImpersonationUnauthenticated {
  unauthenticated: boolean;
}
export type Impersonation = ImpersonationAuthenticated | ImpersonationUnauthenticated;

/** End Dataplane Client Types */

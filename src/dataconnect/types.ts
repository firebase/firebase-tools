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

  datasources: Datasource[];
  source: Source;
}

export interface Connector extends BaseResource {
  name: string;
  source: Source;
}

export interface Datasource {
  postgresql?: PostgreSql;
}

export type SchemaValidation = "STRICT" | "COMPATIBLE";

export interface PostgreSql {
  database: string;
  cloudSql: CloudSqlInstance;
  schemaValidation?: SchemaValidation | "NONE" | "SQL_SCHEMA_VALIDATION_UNSPECIFIED";
}

export interface CloudSqlInstance {
  instance: string;
}

export interface Source {
  files?: File[];
}

export interface File {
  path: string;
  content: string;
}

// An error indicating that the SQL database schema is incompatible with a data connect schema.
export interface IncompatibleSqlSchemaError {
  // A list of differences between the two schema with instructions how to resolve them.
  diffs: Diff[];
  // Whether any of the changes included are destructive.
  destructive: boolean;

  // The failed precondition validation type.
  violationType: "INCOMPATIBLE_SCHEMA" | "INACCESSIBLE_SCHEMA" | string;
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

export type WarningLevel = "INTERACTIVE_ACK" | "REQUIRE_ACK" | "REQUIRE_FORCE";

export interface Workaround {
  description: string;
  reason: string;
  replaceWith: string;
}

export interface GraphqlError {
  message: string;
  path?: (string | number)[];
  locations?: {
    line: number;
    column: number;
  }[];
  extensions?: {
    file?: string;
    warningLevel?: WarningLevel;
    workarounds?: Workaround[];
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
  location: string;
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
    schemaValidation?: SchemaValidation;
  };
}

export interface ConnectorYaml {
  connectorId: string;
  generate?: Generate;
}

export interface Generate {
  javascriptSdk?: JavascriptSDK;
  swiftSdk?: SwiftSDK;
  kotlinSdk?: KotlinSDK;
  dartSdk?: DartSDK;
}

export interface SupportedFrameworks {
  react?: boolean;
  angular?: boolean;
}

export interface JavascriptSDK extends SupportedFrameworks {
  outputDir: string;
  package: string;
  packageJsonDir?: string;
}

export interface SwiftSDK {
  outputDir: string;
  package: string;
}
export interface KotlinSDK {
  outputDir: string;
  package: string;
}
export interface DartSDK {
  outputDir: string;
  package: string;
}

export enum Platform {
  NONE = "NONE",
  ANDROID = "ANDROID",
  WEB = "WEB",
  IOS = "IOS",
  FLUTTER = "FLUTTER",
  MULTIPLE = "MULTIPLE",
}

// Helper types && converters
export interface ServiceInfo {
  serviceName: string;
  sourceDirectory: string;
  schema: Schema;
  connectorInfo: ConnectorInfo[];
  dataConnectYaml: DataConnectYaml;
  deploymentMetadata?: DeploymentMetadata;
}

export interface ConnectorInfo {
  directory: string;
  connector: Connector;
  connectorYaml: ConnectorYaml;
}

export function toDatasource(
  projectId: string,
  locationId: string,
  ds: DatasourceYaml,
): Datasource {
  if (ds?.postgresql) {
    return {
      postgresql: {
        database: ds.postgresql.database,
        cloudSql: {
          instance: `projects/${projectId}/locations/${locationId}/instances/${ds.postgresql.cloudSql.instanceId}`,
        },
        schemaValidation: ds.postgresql.schemaValidation,
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

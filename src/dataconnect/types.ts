// The database schema ID is always 'main'
export const MAIN_SCHEMA_ID = "main";

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
  // One of postgresql or httpGraphql must be set.
  postgresql?: PostgreSql;
  httpGraphql?: HttpGraphql;
}

export type SchemaValidation = "STRICT" | "COMPATIBLE";

export interface PostgreSql {
  ephemeral?: boolean;
  database?: string;
  cloudSql?: CloudSqlInstance;
  schemaValidation?: SchemaValidation | "NONE" | "SQL_SCHEMA_VALIDATION_UNSPECIFIED";
  schemaMigration?: "MIGRATE_COMPATIBLE";
}

export interface HttpGraphql {
  uri: string;
  timeout?: string;
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

export type WarningLevel = "LOG_ONLY" | "INTERACTIVE_ACK" | "REQUIRE_ACK" | "REQUIRE_FORCE";

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
  extensions?: GraphqlErrorExtensions;
}

export interface GraphqlErrorExtensions {
  file?: string;
  code?: string;
  debugDetails?: string;
  warningLevel?: WarningLevel;
  workarounds?: Workaround[];
  [key: string]: any;
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
  // One of `schema` or `schemas` is required.
  schema?: SchemaYaml;
  schemas?: SchemaYaml[];
  location: string;
  connectorDirs: string[];
}

export interface SchemaYaml {
  source: string;
  id?: string;
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
  httpGraphql?: {
    uri: string;
    timeout?: string;
  };
}

export interface ConnectorYaml {
  connectorId: string;
  generate?: Generate;
}

export interface Generate {
  javascriptSdk?: JavascriptSDK | JavascriptSDK[];
  swiftSdk?: SwiftSDK | SwiftSDK[];
  kotlinSdk?: KotlinSDK | KotlinSDK[];
  dartSdk?: DartSDK | DartSDK[];
  adminNodeSdk?: AdminNodeSDK | AdminNodeSDK[];
}

export interface SupportedFrameworks {
  react?: boolean;
  angular?: boolean;
}

export interface AdminNodeSDK {
  outputDir: string;
  package: string;
  packageJsonDir?: string;
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

// Helper types && converters
export interface ServiceInfo {
  serviceName: string;
  sourceDirectory: string;
  schemas: Schema[];
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
  if (ds?.httpGraphql) {
    return {
      httpGraphql: {
        uri: ds.httpGraphql.uri,
        timeout: ds.httpGraphql.timeout,
      },
    };
  }
  return {};
}

/** Returns the main schema YAML for a Data Connect YAML */
export function mainSchemaYaml(dataconnectYaml: DataConnectYaml): SchemaYaml {
  if (dataconnectYaml.schema) {
    return dataconnectYaml.schema;
  }
  const mainSch = dataconnectYaml.schemas?.find((s) => s.id === MAIN_SCHEMA_ID || !s.id);
  if (!mainSch) {
    throw new Error(`Service ${dataconnectYaml.serviceId} has no main schema defined`);
  }
  return mainSch;
}

/** Returns the secondary schema YAMLs for a Data Connect YAML */
export function secondarySchemaYamls(dataconnectYaml: DataConnectYaml): SchemaYaml[] {
  if (dataconnectYaml.schema) {
    return [];
  }
  return (dataconnectYaml.schemas || []).filter((s) => s.id && s.id !== MAIN_SCHEMA_ID);
}

/** Returns the main schema from a list of schemas */
export function mainSchema(schemas: Schema[]): Schema {
  const mainSch = schemas.find((s) => isMainSchema(s));
  if (!mainSch) {
    throw new Error(`No main schema is defined`);
  }
  return mainSch;
}

/** Returns true if the schema is the main schema */
export function isMainSchema(schema: Schema): boolean {
  return schema.name.endsWith(`/schemas/${MAIN_SCHEMA_ID}`);
}

/** Start Dataplane Client Types */
export interface ExecuteGraphqlRequest {
  query: string;
  operationName?: string;
  variables?: { [key: string]: string };
  extensions?: { impersonate?: Impersonation };
}

export interface GraphqlResponse {
  data: Record<string, any>;
  errors: GraphqlError[];
}

export interface ExecuteOperationRequest {
  operationName: string;
  variables?: { [key: string]: string };
}

export interface GraphqlResponseError {
  // One Platform standard puts error body under `error` field.
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: GraphqlError[];
  };
  // However, the GRPC library in emulator service them at top-level.
  code?: number;
  message?: string;
  status?: string;
  details?: GraphqlError[];
}

export const isGraphQLResponse = (g: any): g is GraphqlResponse => !!g.data || !!g.errors;
export const isGraphQLResponseError = (g: any): g is GraphqlResponseError =>
  !!g.error?.message || !!g.message;

interface ImpersonationAuthenticated {
  authClaims: any;
  includeDebugDetails?: boolean;
}
interface ImpersonationUnauthenticated {
  unauthenticated: boolean;
  includeDebugDetails?: boolean;
}
export type Impersonation = ImpersonationAuthenticated | ImpersonationUnauthenticated;

/** End Dataplane Client Types */

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
  schema: Schema;
  connectorInfo: {
    connector: Connector;
    connectorYaml: ConnectorYaml;
  }[];
  dataConnectYaml: DataConnectYaml;
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

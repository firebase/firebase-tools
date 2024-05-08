export interface Database {
  etag?: string;
  name: string;
  instance: string;
  project: string;
}

export interface IpConfiguration {
  ipv4Enabled?: boolean;
  privateNetwork?: string;
  requireSsl?: boolean;
  authorizedNetworks?: {
    value: string;
    expirationTime?: string;
    name?: string;
  }[];
  allocatedIpRange?: string;
  sslMode?:
    | "ALLOW_UNENCRYPTED_AND_ENCRYPTED"
    | "ENCRYPTED_ONLY"
    | "TRUSTED_CLIENT_CERTIFICATE_REQUIRED";
  pscConfig?: {
    allowedConsumerProjects: string[];
    pscEnabled: boolean;
  };
}

export interface InstanceSettings {
  authorizedGaeApplications?: string[];
  tier?: string;
  edition?: "ENTERPRISE_PLUS" | "ENTERPRISE";
  availabilityType?: "ZONAL" | "REGIONAL";
  pricingPlan?: "PER_USE" | "PACKAGE";
  replicationType?: "SYNCHRONOUS" | "ASYNCHRONOUS";
  activationPolicy?: "ALWAYS" | "NEVER";
  ipConfiguration?: IpConfiguration;
  locationPreference?: [Object];
  databaseFlags?: DatabaseFlag[];
  dataDiskType?: "PD_SSD" | "PD_HDD";
  storageAutoResizeLimit?: string;
  storageAutoResize?: boolean;
  dataDiskSizeGb?: string;
  deletionProtectionEnabled?: boolean;
  dataCacheConfig?: {
    dataCacheEnabled: boolean;
  };
  enableGoogleMlIntegration?: boolean;
  insightsConfig?: InsightsConfig;
  userLabels?: { [key: string]: string };
}

export interface DatabaseFlag {
  name: string;
  value: string;
}

interface InsightsConfig {
  queryInsightsEnabled: boolean;
  queryPlansPerMinute: number;
  queryStringLength: number;
}

// TODO: Consider splitting off return only fields and input fields into different types.
export interface Instance {
  state?: "RUNNABLE" | "SUSPENDED" | "PENDING_DELETE" | "PENDING_CREATE" | "MAINTENANCE" | "FAILED";
  databaseVersion:
    | "POSTGRES_15"
    | "POSTGRES_14"
    | "POSTGRES_13"
    | "POSTGRES_12"
    | "POSTGRES_11"
    | string;
  settings: InstanceSettings;
  etag?: string;
  rootPassword: string;
  ipAddresses: {
    type: "PRIMARY" | "OUTGOING" | "PRIVATE";
    ipAddress: string;
    timeToRetire?: string;
  }[];
  serverCaCert?: SslCert;
  instanceType: "CLOUD_SQL_INSTANCE" | "ON_PREMISES_INSTANCE" | "READ_REPLICA_INSTANCE";
  project: string;
  serviceAccountEmailAddress: string;
  backendType: "SECOND_GEN" | "EXTERNAL";
  selfLink?: string;
  connectionName?: string;
  name: string;
  region: string;
  gceZone?: string;
  databaseInstalledVersion?: string;
  maintenanceVersion?: string;
  createTime?: string;
  sqlNetworkArchitecture?: string;
}

export interface SslCert {
  certSerialNumber: string;
  cert: string;
  commonName: string;
  sha1Fingerprint: string;
  instance: string;
  createTime?: string;
  expirationTime?: string;
}

export interface User {
  password?: string;
  name: string;
  host?: string;
  instance: string;
  project: string;
  type: UserType;
  sqlserverUserDetails: {
    disabled: boolean;
    serverRoles: string[];
  };
}

export type UserType = "BUILT_IN" | "CLOUD_IAM_USER" | "CLOUD_IAM_SERVICE_ACCOUNT";

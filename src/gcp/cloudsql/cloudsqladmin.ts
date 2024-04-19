import { Client } from "../../apiv2";
import { cloudSQLAdminOrigin } from "../../api";
import * as operationPoller from "../../operation-poller";
const API_VERSION = "v1";

const client = new Client({
  urlPrefix: cloudSQLAdminOrigin(),
  auth: true,
  apiVersion: API_VERSION,
});

interface Database {
  etag?: string;
  name: string;
  instance: string;
  project: string;
}
interface IpConfiguration {
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
interface InstanceSettings {
  authorizedGaeApplications?: string[];
  tier?: string;
  edition?: "ENTERPRISE_PLUS" | "ENTERPRISE";
  availabilityType?: "ZONAL" | "REGIONAL";
  pricingPlan?: "PER_USE" | "PACKAGE";
  replicationType?: "SYNCHRONOUS" | "ASYNCHRONOUS";
  activationPolicy?: "ALWAYS" | "NEVER";
  ipConfiguration?: IpConfiguration;
  locationPreference?: [Object];
  databaseFlags?: { name: string; value: string }[];
  dataDiskType?: "PD_SSD" | "PD_HDD";
  storageAutoResizeLimit?: string;
  storageAutoResize?: boolean;
  dataDiskSizeGb?: string;
  deletionProtectionEnabled?: boolean;
  dataCacheConfig?: {
    dataCacheEnabled: boolean;
  };
  userLabels?: { [key: string]: string };
}
// TODO: Consider splitting off return only fields and input fields into different types.
interface Instance {
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

interface SslCert {
  certSerialNumber: string;
  cert: string;
  commonName: string;
  sha1Fingerprint: string;
  instance: string;
  createTime?: string;
  expirationTime?: string;
}

interface User {
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

interface Operation {
  status: "RUNNING" | "DONE";
  name: string;
}

export async function listInstances(projectId: string): Promise<Instance[]> {
  const res = await client.get<{ items: Instance[] }>(`projects/${projectId}/instances`);
  return res.body.items;
}

export async function getInstance(projectId: string, instanceId: string): Promise<Instance> {
  const res = await client.get<Instance>(`projects/${projectId}/instances/${instanceId}`);
  return res.body;
}

export async function createInstance(
  projectId: string,
  location: string,
  instanceId: string,
): Promise<Instance> {
  // TODO: Add necessary labels for cSQL billing.
  const op = await client.post<Partial<Instance>, Operation>(`projects/${projectId}/instances`, {
    name: instanceId,
    region: location,
    databaseVersion: "POSTGRES_15",
    settings: {
      tier: "db-f1-micro",
      edition: "ENTERPRISE", // TODO: Figure out what values should be exposed, what should be hard coded
      ipConfiguration: {
        authorizedNetworks: [], // TODO:  Don't expose this DB to everyone in the world {value: "0.0.0.0/0", name: 'public'}
      },
      databaseFlags: [
        { name: "cloudsql.iam_authentication", value: "on" },
        // TODO: Any other flags we want? https://cloud.google.com/sql/docs/postgres/flags
      ],
      storageAutoResize: false,
      userLabels: { "firebase-data-connect": "ft" },
    },
  });
  const opName = `projects/${projectId}/operations/${op.body.name}`;
  const pollRes = await operationPoller.pollOperation<Instance>({
    apiOrigin: cloudSQLAdminOrigin(),
    apiVersion: API_VERSION,
    operationResourceName: opName,
    doneFn: (op: Operation) => op.status === "DONE",
    masterTimeout: 1_200_000, // This operation frequently takes 5+ minutes
  });
  return pollRes;
}

/**
 * Update an existing CloudSQL instance to have any required settings for Firebase Data Connect.
 */
export async function updateInstanceForDataConnect(instance: Instance): Promise<Instance> {
  const dbFlags =
    instance.settings.databaseFlags?.filter((f) => f.name !== "cloudsql.iam_authentication") ?? [];
  dbFlags.push({ name: "cloudsql.iam_authentication", value: "on" });

  const op = await client.patch<Partial<Instance>, Operation>(
    `projects/${instance.project}/instances/${instance.name}`,
    {
      settings: {
        ipConfiguration: {
          ipv4Enabled: true,
        },
        databaseFlags: dbFlags,
      },
    },
  );
  const opName = `projects/${instance.project}/operations/${op.body.name}`;
  const pollRes = await operationPoller.pollOperation<Instance>({
    apiOrigin: cloudSQLAdminOrigin(),
    apiVersion: API_VERSION,
    operationResourceName: opName,
    doneFn: (op: Operation) => op.status === "DONE",
    masterTimeout: 1_200_000, // This operation frequently takes 5+ minutes
  });
  return pollRes;
}

/**
 * Validate that existing CloudSQL instances have the necessary settings.
 */
export function isValidInstanceForDataConnect(instance: Instance): boolean {
  const settings = instance.settings;
  // CloudSQL instances must have public IP enabled to be used with Firebase Data Connect.
  if (!settings.ipConfiguration?.ipv4Enabled) {
    return false;
  }

  // CloudSQL instances must have IAM authentication enabled to be used with Firebase Data Connect.
  const isIamEnabled =
    settings.databaseFlags?.some(
      (f) => f.name === "cloudsql.iam_authentication" && f.value === "on",
    ) ?? false;

  return isIamEnabled;
}

export async function listDatabases(projectId: string, instanceId: string): Promise<Database[]> {
  const res = await client.get<{ items: Database[] }>(
    `projects/${projectId}/instances/${instanceId}/databases`,
  );
  return res.body.items;
}

export async function getDatabase(
  projectId: string,
  instanceId: string,
  databaseId: string,
): Promise<Database> {
  const res = await client.get<Database>(
    `projects/${projectId}/instances/${instanceId}/databases/${databaseId}`,
  );
  return res.body;
}

export async function createDatabase(projectId: string, instanceId: string, databaseId: string) {
  const op = await client.post<{ project: string; instance: string; name: string }, Operation>(
    `projects/${projectId}/instances/${instanceId}/databases`,
    {
      project: projectId,
      instance: instanceId,
      name: databaseId,
    },
  );

  const opName = `projects/${projectId}/operations/${op.body.name}`;
  const pollRes = await operationPoller.pollOperation<Instance>({
    apiOrigin: cloudSQLAdminOrigin(),
    apiVersion: API_VERSION,
    operationResourceName: opName,
    doneFn: (op: Operation) => op.status === "DONE",
  });

  return pollRes;
}

export async function createUser(
  projectId: string,
  instanceId: string,
  type: UserType,
  username: string,
  password?: string,
) {
  const op = await client.post<User, Operation>(
    `projects/${projectId}/instances/${instanceId}/users`,
    {
      name: username,
      instance: instanceId,
      project: projectId,
      password: password,
      sqlserverUserDetails: {
        disabled: false,
        serverRoles: ["cloudsqlsuperuser"], // TODO: What roles does our IAM user need?
      },
      type,
    },
  );
  const opName = `projects/${projectId}/operations/${op.body.name}`;
  const pollRes = await operationPoller.pollOperation<User>({
    apiOrigin: cloudSQLAdminOrigin(),
    apiVersion: API_VERSION,
    operationResourceName: opName,
    doneFn: (op: Operation) => op.status === "DONE",
  });
  return pollRes;
}

export async function getUser(projectId: string, instanceId: string, username: string) {
  const res = await client.get<User>(
    `projects/${projectId}/instances/${instanceId}/users/${username}`,
  );
  return res.body;
}

export async function deleteUser(projectId: string, instanceId: string, username: string) {
  const res = await client.delete<User>(`projects/${projectId}/instances/${instanceId}/users`, {
    queryParams: {
      name: username,
    },
  });
  return res.body;
}

export async function listUsers(projectId: string, instanceId: string) {
  const res = await client.get<{ items: User[] }>(
    `projects/${projectId}/instances/${instanceId}/users`,
  );
  return res.body.items;
}

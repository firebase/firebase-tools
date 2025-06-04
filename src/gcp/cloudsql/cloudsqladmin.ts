import { Client, ClientResponse } from "../../apiv2";
import { cloudSQLAdminOrigin } from "../../api";
import * as operationPoller from "../../operation-poller";
import { Instance, Database, User, UserType, DatabaseFlag } from "./types";
import { needProjectId } from "../../projectUtils";
import { Options } from "../../options";
import { logger } from "../../logger";
import { testIamPermissions } from "../iam";
import { FirebaseError } from "../../error";
const API_VERSION = "v1";

const client = new Client({
  urlPrefix: cloudSQLAdminOrigin(),
  auth: true,
  apiVersion: API_VERSION,
});

interface Operation {
  status: "RUNNING" | "DONE";
  name: string;
}

export async function iamUserIsCSQLAdmin(options: Options): Promise<boolean> {
  const projectId = needProjectId(options);
  const requiredPermissions = [
    "cloudsql.instances.connect",
    "cloudsql.instances.get",
    "cloudsql.users.create",
    "cloudsql.users.update",
  ];

  try {
    const iamResult = await testIamPermissions(projectId, requiredPermissions);
    return iamResult.passed;
  } catch (err: any) {
    logger.debug(`[iam] error while checking permissions, command may fail: ${err}`);
    return false;
  }
}

export async function listInstances(projectId: string): Promise<Instance[]> {
  const res = await client.get<{ items: Instance[] }>(`projects/${projectId}/instances`);
  return res.body.items ?? [];
}

export async function getInstance(projectId: string, instanceId: string): Promise<Instance> {
  const res = await client.get<Instance>(`projects/${projectId}/instances/${instanceId}`);
  if (res.body.state === "FAILED") {
    throw new FirebaseError(
      `Cloud SQL instance ${instanceId} is in a failed state.\nGo to ${instanceConsoleLink(projectId, instanceId)} to repair or delete it.`,
    );
  }
  return res.body;
}

/** Returns a link to Cloud SQL's page in Cloud Console. */
export function instanceConsoleLink(projectId: string, instanceId: string) {
  return `https://console.cloud.google.com/sql/instances/${instanceId}/overview?project=${projectId}`;
}

export async function createInstance(args: {
  projectId: string;
  location: string;
  instanceId: string;
  enableGoogleMlIntegration: boolean;
  waitForCreation: boolean;
  freeTrial: boolean;
}): Promise<Instance | undefined> {
  const databaseFlags = [{ name: "cloudsql.iam_authentication", value: "on" }];
  if (args.enableGoogleMlIntegration) {
    databaseFlags.push({ name: "cloudsql.enable_google_ml_integration", value: "on" });
  }
  let op: ClientResponse<Operation>;
  try {
    op = await client.post<Partial<Instance>, Operation>(`projects/${args.projectId}/instances`, {
      name: args.instanceId,
      region: args.location,
      databaseVersion: "POSTGRES_15",
      settings: {
        tier: "db-f1-micro",
        edition: "ENTERPRISE",
        ipConfiguration: {
          authorizedNetworks: [],
        },
        enableGoogleMlIntegration: args.enableGoogleMlIntegration,
        databaseFlags,
        storageAutoResize: false,
        userLabels: { "firebase-data-connect": args.freeTrial ? "ft" : "nt" },
        insightsConfig: {
          queryInsightsEnabled: true,
          queryPlansPerMinute: 5, // Match the default settings
          queryStringLength: 1024, // Match the default settings
        },
      },
    });
  } catch (err: any) {
    handleAllowlistError(err, args.location);
    throw err;
  }
  if (!args.waitForCreation) {
    return;
  }
  const opName = `projects/${args.projectId}/operations/${op.body.name}`;
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
export async function updateInstanceForDataConnect(
  instance: Instance,
  enableGoogleMlIntegration: boolean,
): Promise<Instance> {
  let dbFlags = setDatabaseFlag(
    { name: "cloudsql.iam_authentication", value: "on" },
    instance.settings.databaseFlags,
  );
  if (enableGoogleMlIntegration) {
    dbFlags = setDatabaseFlag(
      { name: "cloudsql.enable_google_ml_integration", value: "on" },
      dbFlags,
    );
  }

  const op = await client.patch<Partial<Instance>, Operation>(
    `projects/${instance.project}/instances/${instance.name}`,
    {
      settings: {
        ipConfiguration: {
          ipv4Enabled: true,
        },
        databaseFlags: dbFlags,
        enableGoogleMlIntegration,
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

function handleAllowlistError(err: any, region: string) {
  if (err.message.includes("Not allowed to set system label: firebase-data-connect")) {
    throw new FirebaseError(
      `Cloud SQL free trial instances are not yet available in ${region}. Please check https://firebase.google.com/docs/data-connect/ for a full list of available regions.`,
    );
  }
}

function setDatabaseFlag(flag: DatabaseFlag, flags: DatabaseFlag[] = []): DatabaseFlag[] {
  const temp = flags.filter((f) => f.name !== flag.name);
  temp.push(flag);
  return temp;
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

export async function createDatabase(
  projectId: string,
  instanceId: string,
  databaseId: string,
): Promise<Database> {
  const op = await client.post<{ project: string; instance: string; name: string }, Operation>(
    `projects/${projectId}/instances/${instanceId}/databases`,
    {
      project: projectId,
      instance: instanceId,
      name: databaseId,
    },
  );

  const opName = `projects/${projectId}/operations/${op.body.name}`;
  const pollRes = await operationPoller.pollOperation<Database>({
    apiOrigin: cloudSQLAdminOrigin(),
    apiVersion: API_VERSION,
    operationResourceName: opName,
    doneFn: (op: Operation) => op.status === "DONE",
  });

  return pollRes;
}

export async function deleteDatabase(
  projectId: string,
  instanceId: string,
  databaseId: string,
): Promise<Database> {
  const res = await client.delete<Database>(
    `projects/${projectId}/instances/${instanceId}/databases/${databaseId}`,
  );
  return res.body;
}

export async function createUser(
  projectId: string,
  instanceId: string,
  type: UserType,
  username: string,
  password?: string,
): Promise<User> {
  const maxRetries = 3;
  let retries = 0;
  while (true) {
    try {
      const op = await client.post<User, Operation>(
        `projects/${projectId}/instances/${instanceId}/users`,
        {
          name: username,
          instance: instanceId,
          project: projectId,
          password: password,
          sqlserverUserDetails: {
            disabled: false,
            serverRoles: ["cloudsqlsuperuser"],
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
    } catch (err: any) {
      if (builtinRoleNotReady(err.message) && retries < maxRetries) {
        retries++;
        await new Promise((resolve) => {
          setTimeout(resolve, 1000 * retries);
        });
      } else {
        throw err;
      }
    }
  }
}

// CloudSQL built in roles get created _after_ the operation is complete.
// This means that we occasionally bump into cases where we try to create the user
// before the role required for IAM users exists.
function builtinRoleNotReady(message: string): boolean {
  return message.includes("cloudsqliamuser");
}

export async function getUser(
  projectId: string,
  instanceId: string,
  username: string,
): Promise<User> {
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

export async function listUsers(projectId: string, instanceId: string): Promise<User[]> {
  const res = await client.get<{ items: User[] }>(
    `projects/${projectId}/instances/${instanceId}/users`,
  );
  return res.body.items;
}

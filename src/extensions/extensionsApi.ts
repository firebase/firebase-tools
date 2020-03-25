import * as _ from "lodash";
import * as api from "../api";
import * as operationPoller from "../operation-poller";

const VERSION = "v1beta";

export interface ExtensionInstance {
  name: string;
  createTime: string;
  updateTime: string;
  state: string;
  config: ExtensionConfig;
  lastOperationName?: string;
  serviceAccountEmail: string;
}

export interface ExtensionConfig {
  name: string;
  createTime: string;
  source: ExtensionSource;
  params: {
    [key: string]: any;
  };
  populatedPostinstallContent?: string;
}

export interface ExtensionSource {
  name: string;
  packageUri: string;
  hash: string;
  spec: ExtensionSpec;
}

export interface ExtensionSpec {
  specVersion?: string;
  name: string;
  version: string;
  description?: string;
  apis?: Api[];
  roles?: Role[];
  resources: Resource[];
  billingRequired?: boolean;
  author?: Author;
  contributors?: Author[];
  license?: string;
  releaseNotesUrl?: string;
  sourceUrl: string;
  params?: Param[];
  preinstallContent?: string;
  postinstallContent?: string;
  displayName?: string;
}

export interface Api {
  apiName: string;
  reason: string;
}

export interface Role {
  role: string;
  reason: string;
}

export interface Resource {
  name: string;
  type: string;
  description?: string;
  properties?: { [key: string]: any };
}

export interface Author {
  authorName: string;
  url?: string;
}

export interface Param {
  param: string;
  label: string;
  description?: string;
  default?: string;
  type?: ParamType;
  options?: ParamOption[];
  required?: boolean;
  validationRegex?: string;
  validationErrorMessage?: string;
  immutable?: boolean;
}

export enum ParamType {
  STRING = "STRING",
  SELECT = "SELECT",
  MULTISELECT = "MULTISELECT",
}

export interface ParamOption {
  value: string;
  label?: string;
}

/**
 * Create a new extension instance, given a extension source path, a set of params, and a service account
 *
 * @param projectId the project to create the instance in
 * @param instanceId the id to set for the instance
 * @param extensionSource the ExtensionSource to create an instance of
 * @param params params to configure the extension instance
 * @param serviceAccountEmail the email of the service account to use for creating the ExtensionInstance
 */
export async function createInstance(
  projectId: string,
  instanceId: string,
  extensionSource: ExtensionSource,
  params: { [key: string]: string },
  serviceAccountEmail: string
): Promise<ExtensionInstance> {
  const createRes = await api.request("POST", `/${VERSION}/projects/${projectId}/instances/`, {
    auth: true,
    origin: api.extensionsOrigin,
    data: {
      name: `projects/${projectId}/instances/${instanceId}`,
      config: {
        source: { name: extensionSource.name },
        params,
      },
      serviceAccountEmail,
    },
  });
  const pollRes = await operationPoller.pollOperation<ExtensionInstance>({
    apiOrigin: api.extensionsOrigin,
    apiVersion: VERSION,
    operationResourceName: createRes.body.name,
    masterTimeout: 600000,
  });
  return pollRes;
}

/**
 * Delete an instance and all of the associated resources and its service account.
 *
 * @param projectId the project where the instance exists
 * @param instanceId the id of the instance to delete
 */
export async function deleteInstance(projectId: string, instanceId: string): Promise<any> {
  const deleteRes = await api.request(
    "DELETE",
    `/${VERSION}/projects/${projectId}/instances/${instanceId}`,
    {
      auth: true,
      origin: api.extensionsOrigin,
    }
  );
  const pollRes = await operationPoller.pollOperation({
    apiOrigin: api.extensionsOrigin,
    apiVersion: VERSION,
    operationResourceName: deleteRes.body.name,
    masterTimeout: 600000,
  });
  return pollRes;
}

/**
 * Get an instance by its id.
 * @param projectId the project where the instance exists
 * @param instanceId the id of the instance to delete
 * @param options extra options to pass to api.request
 */
export async function getInstance(
  projectId: string,
  instanceId: string,
  options: any = {}
): Promise<any> {
  const res = await api.request(
    "GET",
    `/${VERSION}/projects/${projectId}/instances/${instanceId}`,
    _.assign(
      {
        auth: true,
        origin: api.extensionsOrigin,
      },
      options
    )
  );
  return res.body;
}

/**
 * Returns a list of all installed extension instances on the project with projectId.
 *
 * @param projectId the project to list instances for
 */
export async function listInstances(projectId: string): Promise<ExtensionInstance[]> {
  const instances: any[] = [];
  const getNextPage = async (pageToken?: string) => {
    const res = await api.request("GET", `/${VERSION}/projects/${projectId}/instances`, {
      auth: true,
      origin: api.extensionsOrigin,
      query: {
        pageSize: 100,
        pageToken,
      },
    });
    instances.push(...res.body.instances);
    if (res.body.nextPageToken) {
      await getNextPage(res.body.nextPageToken);
    }
  };
  await getNextPage();
  return instances;
}

/**
 * Configure a extension instance, given an project id, instance id, and a set of params
 *
 * @param projectId the project the instance is in
 * @param instanceId the id of the instance to configure
 * @param params params to configure the extension instance
 */
export async function configureInstance(
  projectId: string,
  instanceId: string,
  params: { [option: string]: string }
): Promise<any> {
  const res = await patchInstance(projectId, instanceId, "config.params", {
    config: {
      params,
    },
  });
  return res;
}

/**
 * Update the version of a extension instance, given an project id, instance id, and a set of params
 *
 * @param projectId the project the instance is in
 * @param instanceId the id of the instance to configure
 * @param ExtensionSource the source for the version of the extension to update to
 * @param params params to configure the extension instance
 */
export async function updateInstance(
  projectId: string,
  instanceId: string,
  extensionSource: ExtensionSource,
  params?: { [option: string]: string }
): Promise<any> {
  const body: any = {
    config: {
      source: { name: extensionSource.name },
    },
  };
  let updateMask = "config.source.name";
  if (params) {
    body.params = params;
    updateMask += ",config.params";
  }
  return await patchInstance(projectId, instanceId, updateMask, body);
}

async function patchInstance(
  projectId: string,
  instanceId: string,
  updateMask: string,
  data: any
): Promise<any> {
  const updateRes = await api.request(
    "PATCH",
    `/${VERSION}/projects/${projectId}/instances/${instanceId}`,
    {
      auth: true,
      origin: api.extensionsOrigin,
      query: {
        updateMask,
      },
      data,
    }
  );
  const pollRes = await operationPoller.pollOperation({
    apiOrigin: api.extensionsOrigin,
    apiVersion: VERSION,
    operationResourceName: updateRes.body.name,
    masterTimeout: 600000,
  });
  return pollRes;
}

/**
 * Create a new extension source
 *
 * @param projectId The project to create the source in
 * @param packageUri A URI for a zipper archive of a extension source
 * @param extensionRoot A directory inside the archive to look for extension.yaml
 */
export async function createSource(
  projectId: string,
  packageUri: string,
  extensionRoot: string
): Promise<ExtensionSource> {
  const createRes = await api.request("POST", `/${VERSION}/projects/${projectId}/sources/`, {
    auth: true,
    origin: api.extensionsOrigin,
    data: {
      packageUri,
      extensionRoot,
    },
  });
  const pollRes = await operationPoller.pollOperation<ExtensionSource>({
    apiOrigin: api.extensionsOrigin,
    apiVersion: VERSION,
    operationResourceName: createRes.body.name,
    masterTimeout: 600000,
  });
  return pollRes;
}

/** Get a extension source by its fully qualified path
 *
 * @param sourceName the fully qualified path of the extension source (/projects/<projectId>/sources/<sourceId>)
 */
export function getSource(sourceName: string): Promise<ExtensionSource> {
  return api
    .request("GET", `/${VERSION}/${sourceName}`, {
      auth: true,
      origin: api.extensionsOrigin,
    })
    .then((res) => {
      return res.body;
    });
}

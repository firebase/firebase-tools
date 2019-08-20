import * as _ from "lodash";
import * as api from "../api";
import * as operationPoller from "../operation-poller";

const VERSION = "v1beta1";

export interface ModInstance {
  name: string;
  createTime: string;
  updateTime: string;
  state: string;
  configuration: ModConfiguration;
  lastOperationName?: string;
  serviceAccountEmail: string;
}

export interface ModConfiguration {
  name: string;
  createTime: string;
  source: ModSource;
  params: {
    [key: string]: any;
  };
  populatedPostinstallContent?: string;
}

export interface ModSource {
  name: string;
  packageUri: string;
  hash: string;
  spec: ModSpec;
}

export interface ModSpec {
  specVersion?: string;
  name: string;
  version?: string;
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
}

export const enum ParamType {
  STRING = "STRING",
  SELECT = "SELECT",
  MULTISELECT = "MULTISELECT",
}

export interface ParamOption {
  value: string;
  label?: string;
}

/**
 * Create a new mod instance, given a mod source path, a set of params, and a service account
 *
 * @param projectId the project to create the instance in
 * @param instanceId the id to set for the instance
 * @param modSource the ModSource to create an instance of
 * @param params params to configure the mod instance
 * @param serviceAccountEmail the email of the service account to use for creating the ModInstance
 */
export async function createInstance(
  projectId: string,
  instanceId: string,
  modSource: ModSource,
  params: { [key: string]: string },
  serviceAccountEmail: string
): Promise<ModInstance> {
  const createRes = await api.request("POST", `/${VERSION}/projects/${projectId}/instances/`, {
    auth: true,
    origin: api.modsOrigin,
    data: {
      name: `projects/${projectId}/instances/${instanceId}`,
      configuration: {
        source: { name: modSource.name },
        params,
      },
      serviceAccountEmail,
    },
  });
  const pollRes = await operationPoller.pollOperation<ModInstance>({
    apiOrigin: api.modsOrigin,
    apiVersion: "v1beta1",
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
      origin: api.modsOrigin,
    }
  );
  const pollRes = await operationPoller.pollOperation({
    apiOrigin: api.modsOrigin,
    apiVersion: "v1beta1",
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
        origin: api.modsOrigin,
      },
      options
    )
  );
  return res.body;
}

/**
 * Returns a list of all installed mod instances on the project with projectId.
 *
 * @param projectId the project to list instances for
 */
export async function listInstances(projectId: string): Promise<ModInstance[]> {
  const instances: any[] = [];
  const getNextPage = async (pageToken?: string) => {
    const res = await api.request("GET", `/${VERSION}/projects/${projectId}/instances`, {
      auth: true,
      origin: api.modsOrigin,
      query: {
        pageSize: 100,
        pageToken,
      },
    });
    instances.push.apply(instances, res.body.instances);
    if (res.body.nextPageToken) {
      await getNextPage(res.body.nextPageToken);
    }
  };
  await getNextPage();
  return instances;
}

/**
 * Configure a mod instance, given an project id, instance id, and a set of params
 *
 * @param projectId the project the instance is in
 * @param instanceId the id of the instance to configure
 * @param params params to configure the mod instance
 */
export async function configureInstance(
  projectId: string,
  instanceId: string,
  params: { [option: string]: string }
): Promise<any> {
  const res = await patchInstance(projectId, instanceId, "configuration.params", {
    configuration: {
      params,
    },
  });
  return res;
}

/**
 * Update the version of a mod instance, given an project id, instance id, and a set of params
 *
 * @param projectId the project the instance is in
 * @param instanceId the id of the instance to configure
 * @param ModSource the source for the version of the mod to update to
 * @param params params to configure the mod instance
 */
export async function updateInstance(
  projectId: string,
  instanceId: string,
  modSource: ModSource,
  params: { [option: string]: string }
): Promise<any> {
  const res = await patchInstance(
    projectId,
    instanceId,
    "configuration.params,configuration.source.name",
    {
      configuration: {
        source: { name: modSource.name },
        params,
      },
    }
  );
  return res;
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
      origin: api.modsOrigin,
      query: {
        updateMask,
      },
      data,
    }
  );
  const pollRes = await operationPoller.pollOperation({
    apiOrigin: api.modsOrigin,
    apiVersion: "v1beta1",
    operationResourceName: updateRes.body.name,
    masterTimeout: 600000,
  });
  return pollRes;
}

/** Get a mod source by its fully qualified path
 *
 * @param sourceName the fully qualified path of the mod source (/projects/<projectId>/sources/<sourceId>)
 */
export function getSource(sourceName: string): Promise<ModSource> {
  return api
    .request("GET", `/${VERSION}/${sourceName}`, {
      auth: true,
      origin: api.modsOrigin,
    })
    .then((res) => {
      return res.body;
    });
}

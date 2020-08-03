import * as semver from "semver";

import * as _ from "lodash";
import * as api from "../api";
import * as operationPoller from "../operation-poller";
import { FirebaseError } from "../error";

const VERSION = "v1beta";
const PAGE_SIZE_MAX = 100;
const refRegex = new RegExp(/^([^/@\n]+)\/{1}([^/@\n]+)(@{1}([a-z0-9.-]+)|)$/);

export interface Extension {
  name: string;
  ref: string;
  state: "STATE_UNSPECIFIED" | "UNPUBLISHED" | "PUBLISHED";
  createTime: string;
  latestVersion?: string;
  latestVersionCreateTime?: string;
}

export interface ExtensionVersion {
  name: string;
  ref: string;
  spec: ExtensionSpec;
  state: "STATE_UNSPECIFIED" | "UNPUBLISHED" | "PUBLISHED";
  hash: string;
  createTime: string;
}

export interface PublisherProfile {
  name: string;
  publisherId: string;
  registerTime: string;
}

export interface ExtensionInstance {
  name: string;
  createTime: string;
  updateTime: string;
  state: "STATE_UNSPECIFIED" | "DEPLOYING" | "UNINSTALLING" | "ACTIVE" | "ERRORED" | "PAUSED";
  config: ExtensionConfig;
  serviceAccountEmail: string;
  errorStatus?: string;
  lastOperationName?: string;
  lastOperationType?: string;
}

export interface ExtensionConfig {
  name: string;
  createTime: string;
  source: ExtensionSource;
  params: {
    [key: string]: any;
  };
  populatedPostinstallContent?: string;
  extensionRef?: string;
  extensionVersion?: string;
}

export interface ExtensionSource {
  name: string;
  packageUri: string;
  hash: string;
  spec: ExtensionSpec;
  extensionRoot?: string;
  fetchTime?: string;
  lastOperationName?: string;
}

export interface ExtensionSpec {
  specVersion?: string;
  name: string;
  version: string;
  displayName?: string;
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
  readmeContent?: string;
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
  example?: string;
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
        pageSize: PAGE_SIZE_MAX,
        pageToken,
      },
    });
    if (Array.isArray(res.body.instances)) {
      instances.push(...res.body.instances);
    }
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
 * @param extensionSource the source for the version of the extension to update to
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

/**
 * @param ref user-friendly identifier for the ExtensionVersion (publisher-id/extension-id@1.0.0)
 */
export async function getExtensionVersion(ref: string): Promise<ExtensionVersion> {
  const { publisherId, extensionId, version } = parseRef(ref);
  if (!version) {
    throw new FirebaseError(`ExtensionVersion ref "${ref}" must supply a version.`);
  }

  const res = await api.request(
    "GET",
    `/${VERSION}/publishers/${publisherId}/extensions/${extensionId}/versions/${version}`,
    {
      auth: true,
      origin: api.extensionsOrigin,
    }
  );
  return res.body;
}

/**
 * @param publisherId the publisher for which we are listing Extensions
 * @param showUnpublished whether to include unpublished Extensions, default = false
 */
export async function listExtensions(
  publisherId: string,
  showUnpublished?: boolean
): Promise<Extension[]> {
  const extensions: Extension[] = [];
  const getNextPage = async (pageToken?: string) => {
    const res = await api.request("GET", `/${VERSION}/publishers/${publisherId}/extensions`, {
      auth: true,
      origin: api.extensionsOrigin,
      query: {
        pageSize: PAGE_SIZE_MAX,
        pageToken,
        showUnpublished: showUnpublished || false,
      },
    });
    if (Array.isArray(res.body.extensions)) {
      extensions.push(...res.body.extensions);
    }
    if (res.body.nextPageToken) {
      await getNextPage(res.body.nextPageToken);
    }
  };
  await getNextPage();
  return extensions;
}

/**
 * @param ref user-friendly identifier for the ExtensionVersion (publisher-id/extension-id)
 * @param showUnpublished whether to include unpublished ExtensionVersions, default = false
 */
export async function listExtensionVersions(
  ref: string,
  showUnpublished?: boolean
): Promise<ExtensionVersion[]> {
  const { publisherId, extensionId } = parseRef(ref);
  const extensionVersions: ExtensionVersion[] = [];
  const getNextPage = async (pageToken?: string) => {
    const res = await api.request(
      "GET",
      `/${VERSION}/publishers/${publisherId}/extensions/${extensionId}/versions`,
      {
        auth: true,
        origin: api.extensionsOrigin,
        query: {
          pageSize: PAGE_SIZE_MAX,
          pageToken,
          showUnpublished: showUnpublished || false,
        },
      }
    );
    if (Array.isArray(res.body.extensionVersions)) {
      extensionVersions.push(...res.body.extensionVersions);
    }
    if (res.body.nextPageToken) {
      await getNextPage(res.body.nextPageToken);
    }
  };
  await getNextPage();
  return extensionVersions;
}

/**
 * @param projectId the project for which we are registering a PublisherProfile
 * @param publisherId the desired publisher ID
 */
export async function registerPublisherProfile(
  projectId: string,
  publisherId: string
): Promise<PublisherProfile> {
  const res = await api.request(
    "POST",
    `/${VERSION}/projects/${projectId}/publisherProfile:register`,
    {
      auth: true,
      origin: api.extensionsOrigin,
      data: { publisherId },
    }
  );
  return res.body;
}

/**
 * @param packageUri public URI of a zip or tarball of the extension source code
 * @param ref user-friendly identifier for the ExtensionVersion (publisher-id/extension-id@1.0.0)
 * @param extensionRoot directory location of extension.yaml in the archived package, defaults to "/".
 */
export async function publishExtensionVersion(
  ref: string,
  packageUri: string,
  extensionRoot?: string
): Promise<ExtensionVersion> {
  const { publisherId, extensionId, version } = parseRef(ref);
  if (!version) {
    throw new FirebaseError(`ExtensionVersion ref "${ref}" must supply a version.`);
  }

  const publishRes = await api.request(
    "POST",
    `/${VERSION}/publishers/${publisherId}/extensions/${extensionId}/versions:publish`,
    {
      auth: true,
      origin: api.extensionsOrigin,
      data: {
        versionId: version,
        packageUri,
        extensionRoot: extensionRoot || "/",
      },
    }
  );
  const pollRes = await operationPoller.pollOperation<ExtensionVersion>({
    apiOrigin: api.extensionsOrigin,
    apiVersion: VERSION,
    operationResourceName: publishRes.body.name,
    masterTimeout: 600000,
  });
  return pollRes;
}

/**
 * @param ref user-friendly identifier for the Extension (publisher-id/extension-id)
 */
export async function unpublishExtension(ref: string): Promise<void> {
  const { publisherId, extensionId } = parseRef(ref);
  await api.request(
    "POST",
    `/${VERSION}/publishers/${publisherId}/extensions/${extensionId}:unpublish`,
    {
      auth: true,
      origin: api.extensionsOrigin,
    }
  );
}

/**
 * @param ref user-friendly identifier for the ExtensionVersion (publisher-id/extension-id@1.0.0)
 */
export async function unpublishExtensionVersion(ref: string): Promise<void> {
  const { publisherId, extensionId, version } = parseRef(ref);
  if (!version) {
    throw new FirebaseError(`ExtensionVersion ref "${ref}" must supply a version.`);
  }

  await api.request(
    "POST",
    `/${VERSION}/publishers/${publisherId}/extensions/${extensionId}/versions/${version}:unpublish`,
    {
      auth: true,
      origin: api.extensionsOrigin,
    }
  );
}

/**
 * @param ref user-friendly identifier for the Extension (publisher-id/extension-id)
 * @return the extension
 */
export async function getExtension(ref: string): Promise<Extension> {
  const { publisherId, extensionId } = parseRef(ref);
  const res = await api.request(
    "GET",
    `/${VERSION}/publishers/${publisherId}/extensions/${extensionId}`,
    {
      auth: true,
      origin: api.extensionsOrigin,
    }
  );
  return res.body;
}

/**
 * @param ref user-friendly identifier
 * @return array of ref split into publisher id, extension id, and version id (if applicable)
 */
export function parseRef(
  ref: string
): {
  publisherId: string;
  extensionId: string;
  version?: string;
} {
  const parts = refRegex.exec(ref);
  // Exec additionally returns original string, index, & input values.
  if (parts && (parts.length == 5 || parts.length == 7)) {
    const publisherId = parts[1];
    const extensionId = parts[2];
    const version = parts[4];
    if (version && !semver.valid(version)) {
      throw new FirebaseError(`Extension reference ${ref} contains an invalid version ${version}.`);
    }
    return { publisherId, extensionId, version };
  }
  throw new FirebaseError(
    "Extension reference must be in format `{publisher}/{extension}(@{version})`."
  );
}

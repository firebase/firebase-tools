import * as semver from "semver";
import * as yaml from "js-yaml";
import * as _ from "lodash";
import * as clc from "cli-color";

import * as api from "../api";
import * as logger from "../logger";
import * as operationPoller from "../operation-poller";
import { FirebaseError } from "../error";

const VERSION = "v1beta";
const PAGE_SIZE_MAX = 100;
const refRegex = new RegExp(/^([^/@\n]+)\/{1}([^/@\n]+)(@{1}([a-z0-9.-]+)|)$/);

export interface Extension {
  name: string;
  ref: string;
  state: "STATE_UNSPECIFIED" | "PUBLISHED";
  createTime: string;
  latestVersion?: string;
  latestVersionCreateTime?: string;
}

export interface ExtensionVersion {
  name: string;
  ref: string;
  spec: ExtensionSpec;
  state?: "STATE_UNSPECIFIED" | "PUBLISHED";
  hash: string;
  createTime?: string;
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
  extensionRef?: string;
  extensionVersion?: string;
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
  state: "STATE_UNSPECIFIED" | "ACTIVE" | "DELETED";
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
  propertiesYaml?: string;
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
 * Create a new extension instance, given a extension source path or extension reference, a set of params, and a service account.
 *
 * @param projectId the project to create the instance in
 * @param instanceId the id to set for the instance
 * @param config instance configuration
 */
export async function createInstance(
  projectId: string,
  instanceId: string,
  config: any
): Promise<ExtensionInstance> {
  const createRes = await api.request("POST", `/${VERSION}/projects/${projectId}/instances/`, {
    auth: true,
    origin: api.extensionsOrigin,
    data: {
      name: `projects/${projectId}/instances/${instanceId}`,
      config: config,
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
 * Create a new extension instance, given a extension source path, a set of params, and a service account.
 *
 * @param projectId the project to create the instance in
 * @param instanceId the id to set for the instance
 * @param extensionSource the ExtensionSource to create an instance of
 * @param params params to configure the extension instance
 */
export async function createInstanceFromSource(
  projectId: string,
  instanceId: string,
  extensionSource: ExtensionSource,
  params: { [key: string]: string }
): Promise<ExtensionInstance> {
  const config = {
    source: { name: extensionSource.name },
    params,
  };
  return createInstance(projectId, instanceId, config);
}

/**
 * Create a new extension instance, given a extension source path, a set of params, and a service account.
 *
 * @param projectId the project to create the instance in
 * @param instanceId the id to set for the instance
 * @param extensionVersion the ExtensionVersion ref
 * @param params params to configure the extension instance
 */
export async function createInstanceFromExtensionVersion(
  projectId: string,
  instanceId: string,
  extensionVersion: ExtensionVersion,
  params: { [key: string]: string }
): Promise<ExtensionInstance> {
  const { publisherId, extensionId, version } = parseRef(extensionVersion.ref);
  const config = {
    extensionRef: `${publisherId}/${extensionId}`,
    extensionVersion: version || "",
    params,
  };
  return createInstance(projectId, instanceId, config);
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

/**
 * Update the version of a extension instance, given an project id, instance id, and a set of params
 *
 * @param projectId the project the instance is in
 * @param instanceId the id of the instance to configure
 * @param extRef reference for the extension to update to
 * @param params params to configure the extension instance
 */
export async function updateInstanceFromRegistry(
  projectId: string,
  instanceId: string,
  extRef: string,
  params?: { [option: string]: string }
): Promise<any> {
  const { publisherId, extensionId, version } = parseRef(extRef);
  const body: any = {
    config: {
      extensionRef: `${publisherId}/${extensionId}`,
      extensionVersion: version,
    },
  };
  let updateMask = "config.extension_ref,config.extension_version";
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

function populateResourceProperties(source: ExtensionSource): void {
  const spec: ExtensionSpec = source.spec;
  if (spec) {
    spec.resources.forEach((r) => {
      try {
        if (r.propertiesYaml) {
          r.properties = yaml.safeLoad(r.propertiesYaml);
        }
      } catch (err) {
        logger.debug(`[ext] failed to parse resource properties yaml: ${err}`);
      }
    });
  }
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
  populateResourceProperties(pollRes);
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
      populateResourceProperties(res.body);
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
  try {
    const res = await api.request(
      "GET",
      `/${VERSION}/publishers/${publisherId}/extensions/${extensionId}/versions/${version}`,
      {
        auth: true,
        origin: api.extensionsOrigin,
      }
    );
    return res.body;
  } catch (err) {
    if (err.status === 404) {
      throw new FirebaseError(
        `The extension reference '${clc.bold(
          ref
        )}' doesn't exist. This could happen for two reasons:\n` +
          `  -The publisher ID '${clc.bold(publisherId)}' doesn't exist or could be misspelled\n` +
          `  -The name of the extension version '${clc.bold(
            `${extensionId}@${version}`
          )}' doesn't exist or could be misspelled\n` +
          `Please correct the extension reference and try again.`
      );
    } else if (err instanceof FirebaseError) {
      throw err;
    }
    throw new FirebaseError(`Failed to query the extension version '${clc.bold(ref)}': ${err}`);
  }
}

/**
 * @param publisherId the publisher for which we are listing Extensions
 * @param showUnpublished whether to include unpublished Extensions, default = false
 */
export async function listExtensions(publisherId: string): Promise<Extension[]> {
  const extensions: Extension[] = [];
  const getNextPage = async (pageToken?: string) => {
    const res = await api.request("GET", `/${VERSION}/publishers/${publisherId}/extensions`, {
      auth: true,
      origin: api.extensionsOrigin,
      showUnpublished: false,
      query: {
        pageSize: PAGE_SIZE_MAX,
        pageToken,
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
export async function listExtensionVersions(ref: string): Promise<ExtensionVersion[]> {
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
  const { publisherId, extensionId, version } = parseRef(ref);
  if (version) {
    throw new FirebaseError(`Extension reference "${ref}" must not contain a version.`);
  }
  const url = `/${VERSION}/publishers/${publisherId}/extensions/${extensionId}:unpublish`;
  try {
    await api.request("POST", url, {
      auth: true,
      origin: api.extensionsOrigin,
    });
  } catch (err) {
    if (err.status === 403) {
      throw new FirebaseError(
        `You are not the owner of extension '${clc.bold(
          ref
        )}' and don’t have the correct permissions to unpublish this extension.`
      );
    } else if (err instanceof FirebaseError) {
      throw err;
    }
    throw new FirebaseError(`Error occurred unpublishing extension '${ref}': ${err}`);
  }
}

/**
 * @param ref user-friendly identifier for the Extension (publisher-id/extension-id)
 * @return the extension
 */
export async function getExtension(ref: string): Promise<Extension> {
  const { publisherId, extensionId } = parseRef(ref);
  try {
    const res = await api.request(
      "GET",
      `/${VERSION}/publishers/${publisherId}/extensions/${extensionId}`,
      {
        auth: true,
        origin: api.extensionsOrigin,
      }
    );
    return res.body;
  } catch (err) {
    if (err.status === 404) {
      throw new FirebaseError(
        `The extension reference '${clc.bold(
          ref
        )}' doesn't exist. This could happen for two reasons:\n` +
          `  -The publisher ID '${clc.bold(publisherId)}' doesn't exist or could be misspelled\n` +
          `  -The name of the extension '${clc.bold(
            extensionId
          )}' doesn't exist or could be misspelled\n` +
          `Please correct the extension reference and try again.`
      );
    } else if (err instanceof FirebaseError) {
      throw err;
    }
    throw new FirebaseError(`Failed to query the extension '${clc.bold(ref)}': ${err}`);
  }
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
    if (version && !semver.valid(version) && version !== "latest") {
      throw new FirebaseError(`Extension reference ${ref} contains an invalid version ${version}.`);
    }
    return { publisherId, extensionId, version };
  }
  throw new FirebaseError(
    "Extension reference must be in format '{publisher}/{extension}(@{version})'."
  );
}

/**
 * @param extensionVersionName resource name of the format `publishers/<publisherID>/extensions/<extensionID>/versions/<versionID>`
 * @return array of ref split into publisher id, extension id, and version id (if applicable)
 */
export function parseExtensionVersionName(
  extensionVersionName: string
): {
  publisherId: string;
  extensionId: string;
  version?: string;
} {
  const parts = extensionVersionName.split("/");
  if (
    parts.length !== 6 ||
    parts[0] !== "publishers" ||
    parts[2] !== "extensions" ||
    parts[4] !== "versions"
  ) {
    throw new FirebaseError(
      "Extension version name must be in the format `publishers/<publisherID>/extensions/<extensionID>/versions/<versionID>`."
    );
  }
  const publisherId = parts[1];
  const extensionId = parts[3];
  const version = parts[5];
  return { publisherId, extensionId, version };
}

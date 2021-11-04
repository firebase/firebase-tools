import * as yaml from "js-yaml";
import * as _ from "lodash";
import * as clc from "cli-color";
import * as marked from "marked";
import * as api from "../api";
import * as refs from "./refs";
import { logger } from "../logger";
import * as operationPoller from "../operation-poller";
import { FirebaseError } from "../error";

const VERSION = "v1beta";
const PAGE_SIZE_MAX = 100;

export enum RegistryLaunchStage {
  EXPERIMENTAL = "EXPERIMENTAL",
  BETA = "BETA",
  GA = "GA",
  DEPRECATED = "DEPRECATED",
  REGISTRY_LAUNCH_STAGE_UNSPECIFIED = "REGISTRY_LAUNCH_STAGE_UNSPECIFIED",
}

export enum Visibility {
  UNLISTED = "unlisted",
  PUBLIC = "public",
}

export interface Extension {
  name: string;
  ref: string;
  visibility: Visibility;
  registryLaunchStage: RegistryLaunchStage;
  createTime: string;
  latestVersion?: string;
  latestVersionCreateTime?: string;
}

export interface ExtensionVersion {
  name: string;
  ref: string;
  spec: ExtensionSpec;
  hash: string;
  sourceDownloadUri: string;
  releaseNotes?: string;
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
  params: Param[];
  preinstallContent?: string;
  postinstallContent?: string;
  readmeContent?: string;
  externalServices?: ExternalService[];
}

export interface ExternalService {
  name: string;
  pricingUri: string;
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
  SECRET = "SECRET",
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
async function createInstanceHelper(
  projectId: string,
  instanceId: string,
  config: any,
  validateOnly: boolean = false
): Promise<ExtensionInstance> {
  const createRes = await api.request("POST", `/${VERSION}/projects/${projectId}/instances/`, {
    auth: true,
    origin: api.extensionsOrigin,
    data: {
      name: `projects/${projectId}/instances/${instanceId}`,
      config: config,
    },
    query: {
      validateOnly,
    },
  });
  if (validateOnly) {
    return createRes;
  }
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
 * @param validateOnly if true, only validates the update and makes no changes
 */
export async function createInstance(args: {
  projectId: string;
  instanceId: string;
  extensionSource?: ExtensionSource;
  extensionVersionRef?: string;
  params: { [key: string]: string };
  validateOnly?: boolean;
}): Promise<ExtensionInstance> {
  const config: any = {
    params: args.params,
  };

  if (args.extensionSource && args.extensionVersionRef) {
    throw new FirebaseError(
      "ExtensionSource and ExtensionVersion both provided, but only one should be."
    );
  } else if (args.extensionSource) {
    config.source = { name: args.extensionSource?.name };
  } else if (args.extensionVersionRef) {
    const ref = refs.parse(args.extensionVersionRef);
    config.extensionRef = refs.toExtensionRef(ref);
    config.extensionVersion = ref.version ?? "";
  } else {
    throw new FirebaseError("No ExtensionVersion or ExtensionSource provided but one is required.");
  }
  return createInstanceHelper(args.projectId, args.instanceId, config, args.validateOnly);
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
 * @param validateOnly if true, only validates the update and makes no changes
 */
export async function configureInstance(args: {
  projectId: string;
  instanceId: string;
  params: { [option: string]: string };
  validateOnly?: boolean;
}): Promise<any> {
  const res = await patchInstance({
    projectId: args.projectId,
    instanceId: args.instanceId,
    updateMask: "config.params",
    validateOnly: args.validateOnly ?? false,
    data: {
      config: {
        params: args.params,
      },
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
 * @param validateOnly if true, only validates the update and makes no changes
 */
export async function updateInstance(args: {
  projectId: string;
  instanceId: string;
  extensionSource: ExtensionSource;
  params?: { [option: string]: string };
  validateOnly?: boolean;
}): Promise<any> {
  const body: any = {
    config: {
      source: { name: args.extensionSource.name },
    },
  };
  let updateMask = "config.source.name";
  if (args.params) {
    body.config.params = args.params;
    updateMask += ",config.params";
  }
  return await patchInstance({
    projectId: args.projectId,
    instanceId: args.instanceId,
    updateMask,
    validateOnly: args.validateOnly ?? false,
    data: body,
  });
}

/**
 * Update the version of a extension instance, given an project id, instance id, and a set of params
 *
 * @param projectId the project the instance is in
 * @param instanceId the id of the instance to configure
 * @param extRef reference for the extension to update to
 * @param params params to configure the extension instance
 * @param validateOnly if true, only validates the update and makes no changes
 */
export async function updateInstanceFromRegistry(args: {
  projectId: string;
  instanceId: string;
  extRef: string;
  params?: { [option: string]: string };
  validateOnly?: boolean;
}): Promise<any> {
  const ref = refs.parse(args.extRef);
  const body: any = {
    config: {
      extensionRef: refs.toExtensionRef(ref),
      extensionVersion: ref.version,
    },
  };
  let updateMask = "config.extension_ref,config.extension_version";
  if (args.params) {
    body.config.params = args.params;
    updateMask += ",config.params";
  }
  return await patchInstance({
    projectId: args.projectId,
    instanceId: args.instanceId,
    updateMask,
    validateOnly: args.validateOnly ?? false,
    data: body,
  });
}

async function patchInstance(args: {
  projectId: string;
  instanceId: string;
  updateMask: string;
  validateOnly: boolean;
  data: any;
}): Promise<any> {
  const updateRes = await api.request(
    "PATCH",
    `/${VERSION}/projects/${args.projectId}/instances/${args.instanceId}`,
    {
      auth: true,
      origin: api.extensionsOrigin,
      query: {
        updateMask: args.updateMask,
        validateOnly: args.validateOnly,
      },
      data: args.data,
    }
  );
  if (args.validateOnly) {
    return updateRes;
  }
  const pollRes = await operationPoller.pollOperation({
    apiOrigin: api.extensionsOrigin,
    apiVersion: VERSION,
    operationResourceName: updateRes.body.name,
    masterTimeout: 600000,
  });
  return pollRes;
}

function populateResourceProperties(spec: ExtensionSpec): void {
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
  if (pollRes.spec) {
    populateResourceProperties(pollRes.spec);
  }
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
      if (res.body.spec) {
        populateResourceProperties(res.body.spec);
      }
      return res.body;
    });
}

/**
 * @param ref user-friendly identifier for the ExtensionVersion (publisher-id/extension-id@1.0.0)
 */
export async function getExtensionVersion(extensionVersionRef: string): Promise<ExtensionVersion> {
  const ref = refs.parse(extensionVersionRef);
  if (!ref.version) {
    throw new FirebaseError(`ExtensionVersion ref "${extensionVersionRef}" must supply a version.`);
  }
  try {
    const res = await api.request("GET", `/${VERSION}/${refs.toExtensionVersionName(ref)}`, {
      auth: true,
      origin: api.extensionsOrigin,
    });
    if (res.body.spec) {
      populateResourceProperties(res.body.spec);
    }
    return res.body;
  } catch (err) {
    if (err.status === 404) {
      throw refNotFoundError(ref);
    } else if (err instanceof FirebaseError) {
      throw err;
    }
    throw new FirebaseError(
      `Failed to query the extension version '${clc.bold(extensionVersionRef)}': ${err}`
    );
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
export async function listExtensionVersions(
  ref: string,
  filter?: string
): Promise<ExtensionVersion[]> {
  const { publisherId, extensionId } = refs.parse(ref);
  const extensionVersions: ExtensionVersion[] = [];
  const getNextPage = async (pageToken?: string) => {
    const res = await api.request(
      "GET",
      `/${VERSION}/publishers/${publisherId}/extensions/${extensionId}/versions`,
      {
        auth: true,
        origin: api.extensionsOrigin,
        query: {
          filter,
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
 * @param extensionVersionRef user-friendly identifier for the ExtensionVersion (publisher-id/extension-id@1.0.0)
 * @param extensionRoot directory location of extension.yaml in the archived package, defaults to "/".
 */
export async function publishExtensionVersion(
  extensionVersionRef: string,
  packageUri: string,
  extensionRoot?: string
): Promise<ExtensionVersion> {
  const ref = refs.parse(extensionVersionRef);
  if (!ref.version) {
    throw new FirebaseError(`ExtensionVersion ref "${extensionVersionRef}" must supply a version.`);
  }

  // TODO(b/185176470): Publishing an extension with a previously deleted name will return 409.
  // Need to surface a better error, potentially by calling getExtension.
  const publishRes = await api.request(
    "POST",
    `/${VERSION}/${refs.toExtensionName(ref)}/versions:publish`,
    {
      auth: true,
      origin: api.extensionsOrigin,
      data: {
        versionId: ref.version,
        packageUri,
        extensionRoot: extensionRoot ?? "/",
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
 * @deprecated This endpoint is replaced with deleteExtension.
 * @param extensionRef user-friendly identifier for the Extension (publisher-id/extension-id)
 */
export async function unpublishExtension(extensionRef: string): Promise<void> {
  const ref = refs.parse(extensionRef);
  if (ref.version) {
    throw new FirebaseError(`Extension reference "${extensionRef}" must not contain a version.`);
  }
  const url = `/${VERSION}/${refs.toExtensionName(ref)}:unpublish`;
  try {
    await api.request("POST", url, {
      auth: true,
      origin: api.extensionsOrigin,
    });
  } catch (err) {
    if (err.status === 403) {
      throw new FirebaseError(
        `You are not the owner of extension '${clc.bold(
          extensionRef
        )}' and don’t have the correct permissions to unpublish this extension.`,
        { status: err.status }
      );
    } else if (err instanceof FirebaseError) {
      throw err;
    }
    throw new FirebaseError(`Error occurred unpublishing extension '${extensionRef}': ${err}`, {
      status: err.status,
    });
  }
}

/**
 * Delete a published extension.
 * This will also mark the name as reserved to prevent future usages.
 * @param extensionRef user-friendly identifier for the Extension (publisher-id/extension-id)
 */
export async function deleteExtension(extensionRef: string): Promise<void> {
  const ref = refs.parse(extensionRef);
  if (ref.version) {
    throw new FirebaseError(`Extension reference "${extensionRef}" must not contain a version.`);
  }
  const url = `/${VERSION}/${refs.toExtensionName(ref)}`;
  try {
    await api.request("DELETE", url, {
      auth: true,
      origin: api.extensionsOrigin,
    });
  } catch (err) {
    if (err.status === 403) {
      throw new FirebaseError(
        `You are not the owner of extension '${clc.bold(
          extensionRef
        )}' and don’t have the correct permissions to delete this extension.`,
        { status: err.status }
      );
    } else if (err.status === 404) {
      throw new FirebaseError(`Extension ${clc.bold(extensionRef)} was not found.`);
    } else if (err instanceof FirebaseError) {
      throw err;
    }
    throw new FirebaseError(`Error occurred delete extension '${extensionRef}': ${err}`, {
      status: err.status,
    });
  }
}

/**
 * @param ref user-friendly identifier for the Extension (publisher-id/extension-id)
 * @return the extension
 */
export async function getExtension(extensionRef: string): Promise<Extension> {
  const ref = refs.parse(extensionRef);
  try {
    const res = await api.request("GET", `/${VERSION}/${refs.toExtensionName(ref)}`, {
      auth: true,
      origin: api.extensionsOrigin,
    });
    return res.body;
  } catch (err) {
    if (err.status === 404) {
      throw refNotFoundError(ref);
    } else if (err instanceof FirebaseError) {
      throw err;
    }
    throw new FirebaseError(`Failed to query the extension '${clc.bold(extensionRef)}': ${err}`, {
      status: err.status,
    });
  }
}

function refNotFoundError(ref: refs.Ref): FirebaseError {
  return new FirebaseError(
    `The extension reference '${clc.bold(
      ref.version ? refs.toExtensionVersionRef(ref) : refs.toExtensionRef(ref)
    )}' doesn't exist. This could happen for two reasons:\n` +
      `  -The publisher ID '${clc.bold(ref.publisherId)}' doesn't exist or could be misspelled\n` +
      `  -The name of the ${ref.version ? "extension version" : "extension"} '${clc.bold(
        ref.version ? `${ref.extensionId}@${ref.version}` : ref.extensionId
      )}' doesn't exist or could be misspelled\n\n` +
      `Please correct the extension reference and try again. If you meant to install an extension from a local source, please provide a relative path prefixed with '${clc.bold(
        "./"
      )}', '${clc.bold("../")}', or '${clc.bold(
        "~/"
      )}'. Learn more about local extension installation at ${marked(
        "[https://firebase.google.com/docs/extensions/alpha/install-extensions_community#install](https://firebase.google.com/docs/extensions/alpha/install-extensions_community#install)."
      )}`,
    { status: 404 }
  );
}

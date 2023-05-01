import * as yaml from "js-yaml";
import * as clc from "colorette";
import { marked } from "marked";

import { Client } from "../apiv2";
import { extensionsOrigin, extensionsPublisherOrigin } from "../api";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as operationPoller from "../operation-poller";
import * as refs from "./refs";
import {
  Extension,
  ExtensionInstance,
  ExtensionSource,
  ExtensionSpec,
  ExtensionVersion,
  PublisherProfile,
} from "./types";

const EXTENSIONS_API_VERSION = "v1beta";
const PUBLISHER_API_VERSION = "v1beta";
const PAGE_SIZE_MAX = 100;

const extensionsApiClient = new Client({
  urlPrefix: extensionsOrigin,
  apiVersion: EXTENSIONS_API_VERSION,
});
const extensionsPublisherApiClient = new Client({
  urlPrefix: extensionsPublisherOrigin,
  apiVersion: PUBLISHER_API_VERSION,
});

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
  validateOnly = false
): Promise<ExtensionInstance> {
  const createRes = await extensionsApiClient.post<
    { name: string; config: unknown },
    ExtensionInstance
  >(
    `/projects/${projectId}/instances/`,
    {
      name: `projects/${projectId}/instances/${instanceId}`,
      config,
    },
    {
      queryParams: {
        validateOnly: validateOnly ? "true" : "false",
      },
    }
  );
  if (validateOnly) {
    return createRes.body;
  }
  const pollRes = await operationPoller.pollOperation<ExtensionInstance>({
    apiOrigin: extensionsOrigin,
    apiVersion: EXTENSIONS_API_VERSION,
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
  params: Record<string, string>;
  systemParams?: Record<string, string>;
  allowedEventTypes?: string[];
  eventarcChannel?: string;
  validateOnly?: boolean;
}): Promise<ExtensionInstance> {
  const config: any = {
    params: args.params,
    systemParams: args.systemParams ?? {},
    allowedEventTypes: args.allowedEventTypes,
    eventarcChannel: args.eventarcChannel,
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
  if (args.allowedEventTypes) {
    config.allowedEventTypes = args.allowedEventTypes;
  }
  if (args.eventarcChannel) {
    config.eventarcChannel = args.eventarcChannel;
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
  const deleteRes = await extensionsApiClient.delete<{ name: string }>(
    `/projects/${projectId}/instances/${instanceId}`
  );
  const pollRes = await operationPoller.pollOperation({
    apiOrigin: extensionsOrigin,
    apiVersion: EXTENSIONS_API_VERSION,
    operationResourceName: deleteRes.body.name,
    masterTimeout: 600000,
  });
  return pollRes;
}

/**
 * Get an instance by its id.
 * @param projectId the project where the instance exists
 * @param instanceId the id of the instance to delete
 */
export async function getInstance(projectId: string, instanceId: string): Promise<any> {
  try {
    const res = await extensionsApiClient.get(`/projects/${projectId}/instances/${instanceId}`);
    return res.body;
  } catch (err: any) {
    if (err.status === 404) {
      throw new FirebaseError(
        `Extension instance '${clc.bold(instanceId)}' not found in project '${clc.bold(
          projectId
        )}'.`,
        { status: 404 }
      );
    }
    throw err;
  }
}

/**
 * Returns a list of all installed extension instances on the project with projectId.
 *
 * @param projectId the project to list instances for
 */
export async function listInstances(projectId: string): Promise<ExtensionInstance[]> {
  const instances: ExtensionInstance[] = [];
  const getNextPage = async (pageToken = ""): Promise<void> => {
    const res = await extensionsApiClient.get<{
      instances: ExtensionInstance[];
      nextPageToken?: string;
    }>(`/projects/${projectId}/instances`, {
      queryParams: {
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
 * @param allowedEventTypes types of events (selected by consumer) that the extension is allowed to emit
 * @param eventarcChannel fully qualified eventarc channel resource name to emit events to
 * @param validateOnly if true, only validates the update and makes no changes
 */
export async function configureInstance(args: {
  projectId: string;
  instanceId: string;
  params: Record<string, string>;
  systemParams?: Record<string, string>;
  canEmitEvents: boolean;
  allowedEventTypes?: string[];
  eventarcChannel?: string;
  validateOnly?: boolean;
}): Promise<any> {
  const reqBody: any = {
    projectId: args.projectId,
    instanceId: args.instanceId,
    updateMask: "config.params",
    validateOnly: args.validateOnly ?? false,
    data: {
      config: {
        params: args.params,
      },
    },
  };
  if (args.canEmitEvents) {
    if (args.allowedEventTypes === undefined || args.eventarcChannel === undefined) {
      throw new FirebaseError(
        `This instance is configured to emit events, but either allowed event types or eventarc channel is undefined.`
      );
    }
    reqBody.data.config.allowedEventTypes = args.allowedEventTypes;
    reqBody.data.config.eventarcChannel = args.eventarcChannel;
  }
  reqBody.updateMask += ",config.allowed_event_types,config.eventarc_channel";
  if (args.systemParams) {
    reqBody.data.config.systemParams = args.systemParams;
    reqBody.updateMask += ",config.system_params";
  }
  return patchInstance(reqBody);
}

/**
 * Update the version of a extension instance, given an project id, instance id, and a set of params
 *
 * @param projectId the project the instance is in
 * @param instanceId the id of the instance to configure
 * @param extensionSource the source for the version of the extension to update to
 * @param params params to configure the extension instance
 * @param allowedEventTypes types of events (selected by consumer) that the extension is allowed to emit
 * @param eventarcChannel fully qualified eventarc channel resource name to emit events to
 * @param validateOnly if true, only validates the update and makes no changes
 */
export async function updateInstance(args: {
  projectId: string;
  instanceId: string;
  extensionSource: ExtensionSource;
  params?: Record<string, string>;
  systemParams?: Record<string, string>;
  canEmitEvents: boolean;
  allowedEventTypes?: string[];
  eventarcChannel?: string;
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
  if (args.systemParams) {
    body.config.systemParams = args.systemParams;
    updateMask += ",config.system_params";
  }
  if (args.canEmitEvents) {
    if (args.allowedEventTypes === undefined || args.eventarcChannel === undefined) {
      throw new FirebaseError(
        `This instance is configured to emit events, but either allowed event types or eventarc channel is undefined.`
      );
    }
    body.config.allowedEventTypes = args.allowedEventTypes;
    body.config.eventarcChannel = args.eventarcChannel;
  }
  updateMask += ",config.allowed_event_types,config.eventarc_channel";
  return patchInstance({
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
 * @param allowedEventTypes types of events (selected by consumer) that the extension is allowed to emit
 * @param eventarcChannel fully qualified eventarc channel resource name to emit events to
 * @param validateOnly if true, only validates the update and makes no changes
 */
export async function updateInstanceFromRegistry(args: {
  projectId: string;
  instanceId: string;
  extRef: string;
  params?: Record<string, string>;
  systemParams?: Record<string, string>;
  canEmitEvents: boolean;
  allowedEventTypes?: string[];
  eventarcChannel?: string;
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
  if (args.systemParams) {
    body.config.systemParams = args.systemParams;
    updateMask += ",config.system_params";
  }
  if (args.canEmitEvents) {
    if (args.allowedEventTypes === undefined || args.eventarcChannel === undefined) {
      throw new FirebaseError(
        `This instance is configured to emit events, but either allowed event types or eventarc channel is undefined.`
      );
    }
    body.config.allowedEventTypes = args.allowedEventTypes;
    body.config.eventarcChannel = args.eventarcChannel;
  }
  updateMask += ",config.allowed_event_types,config.eventarc_channel";
  return patchInstance({
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
  const updateRes = await extensionsApiClient.patch<unknown, { name: string }>(
    `/projects/${args.projectId}/instances/${args.instanceId}`,
    args.data,
    {
      queryParams: {
        updateMask: args.updateMask,
        validateOnly: args.validateOnly ? "true" : "false",
      },
    }
  );
  if (args.validateOnly) {
    return updateRes;
  }
  const pollRes = await operationPoller.pollOperation({
    apiOrigin: extensionsOrigin,
    apiVersion: EXTENSIONS_API_VERSION,
    operationResourceName: updateRes.body.name,
    masterTimeout: 600000,
  });
  return pollRes;
}

function populateSpec(spec: ExtensionSpec): void {
  if (spec) {
    for (const r of spec.resources) {
      try {
        if (r.propertiesYaml) {
          r.properties = yaml.safeLoad(r.propertiesYaml);
        }
      } catch (err: any) {
        logger.debug(`[ext] failed to parse resource properties yaml: ${err}`);
      }
    }
    // We need to populate empty repeated fields with empty arrays, since proto wire format removes them.
    spec.params = spec.params ?? [];
    spec.systemParams = spec.systemParams ?? [];
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
  const createRes = await extensionsApiClient.post<
    { packageUri: string; extensionRoot: string },
    ExtensionSource
  >(`/projects/${projectId}/sources/`, {
    packageUri,
    extensionRoot,
  });
  const pollRes = await operationPoller.pollOperation<ExtensionSource>({
    apiOrigin: extensionsOrigin,
    apiVersion: EXTENSIONS_API_VERSION,
    operationResourceName: createRes.body.name,
    masterTimeout: 600000,
  });
  if (pollRes.spec) {
    populateSpec(pollRes.spec);
  }
  return pollRes;
}

/**
 * Get a extension source by its fully qualified path
 *
 * @param sourceName the fully qualified path of the extension source (/projects/<projectId>/sources/<sourceId>)
 */
export async function getSource(sourceName: string): Promise<ExtensionSource> {
  const res = await extensionsApiClient.get<ExtensionSource>(`/${sourceName}`);
  if (res.body.spec) {
    populateSpec(res.body.spec);
  }
  return res.body;
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
    const res = await extensionsApiClient.get<ExtensionVersion>(
      `/${refs.toExtensionVersionName(ref)}`
    );
    if (res.body.spec) {
      populateSpec(res.body.spec);
    }
    return res.body;
  } catch (err: any) {
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
 */
export async function listExtensions(publisherId: string): Promise<Extension[]> {
  const extensions: Extension[] = [];
  const getNextPage = async (pageToken = "") => {
    const res = await extensionsApiClient.get<{ extensions: Extension[]; nextPageToken: string }>(
      `/publishers/${publisherId}/extensions`,
      {
        queryParams: {
          pageSize: PAGE_SIZE_MAX,
          pageToken,
        },
      }
    );
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
 */
export async function listExtensionVersions(
  ref: string,
  filter = "",
  showPrereleases = false
): Promise<ExtensionVersion[]> {
  const { publisherId, extensionId } = refs.parse(ref);
  const extensionVersions: ExtensionVersion[] = [];
  const getNextPage = async (pageToken = "") => {
    const res = await extensionsApiClient.get<{
      extensionVersions: ExtensionVersion[];
      nextPageToken: string;
    }>(`/publishers/${publisherId}/extensions/${extensionId}/versions`, {
      queryParams: {
        filter,
        showPrereleases: String(showPrereleases),
        pageSize: PAGE_SIZE_MAX,
        pageToken,
      },
    });
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
export async function getPublisherProfile(
  projectId: string,
  publisherId?: string
): Promise<PublisherProfile> {
  const res = await extensionsPublisherApiClient.get(`/projects/${projectId}/publisherProfile`, {
    queryParams:
      publisherId === undefined
        ? undefined
        : {
            publisherId,
          },
  });
  return res.body as PublisherProfile;
}

/**
 * @param projectId the project for which we are registering a PublisherProfile
 * @param publisherId the desired publisher ID
 */
export async function registerPublisherProfile(
  projectId: string,
  publisherId: string
): Promise<PublisherProfile> {
  const res = await extensionsPublisherApiClient.patch<Partial<PublisherProfile>, PublisherProfile>(
    `/projects/${projectId}/publisherProfile`,
    {
      publisherId,
      displayName: publisherId,
    },
    {
      queryParams: {
        updateMask: "publisher_id,display_name",
      },
    }
  );
  return res.body;
}

/**
 * @param extensionRef user-friendly identifier for the ExtensionVersion (publisher-id/extension-id@version)
 * @param deprecationMessage the deprecation message
 */
export async function deprecateExtensionVersion(
  extensionRef: string,
  deprecationMessage: string
): Promise<ExtensionVersion> {
  const ref = refs.parse(extensionRef);
  try {
    const res = await extensionsPublisherApiClient.post<
      { deprecationMessage: string },
      ExtensionVersion
    >(`/${refs.toExtensionVersionName(ref)}:deprecate`, {
      deprecationMessage,
    });
    return res.body;
  } catch (err: any) {
    if (err.status === 403) {
      throw new FirebaseError(
        `You are not the owner of extension '${clc.bold(
          extensionRef
        )}' and don’t have the correct permissions to deprecate this extension version.` + err,
        { status: err.status }
      );
    } else if (err.status === 404) {
      throw new FirebaseError(`Extension version ${clc.bold(extensionRef)} was not found.`);
    } else if (err instanceof FirebaseError) {
      throw err;
    }
    throw new FirebaseError(
      `Error occurred deprecating extension version '${extensionRef}': ${err}`,
      {
        status: err.status,
      }
    );
  }
}

/**
 * @param extensionRef user-friendly identifier for the ExtensionVersion (publisher-id/extension-id@version)
 */
export async function undeprecateExtensionVersion(extensionRef: string): Promise<ExtensionVersion> {
  const ref = refs.parse(extensionRef);
  try {
    const res = await extensionsPublisherApiClient.post<void, ExtensionVersion>(
      `/${refs.toExtensionVersionName(ref)}:undeprecate`
    );
    return res.body;
  } catch (err: any) {
    if (err.status === 403) {
      throw new FirebaseError(
        `You are not the owner of extension '${clc.bold(
          extensionRef
        )}' and don’t have the correct permissions to undeprecate this extension version.`,
        { status: err.status }
      );
    } else if (err.status === 404) {
      throw new FirebaseError(`Extension version ${clc.bold(extensionRef)} was not found.`);
    } else if (err instanceof FirebaseError) {
      throw err;
    }
    throw new FirebaseError(
      `Error occurred undeprecating extension version '${extensionRef}': ${err}`,
      {
        status: err.status,
      }
    );
  }
}

/**
 * @param extensionVersionRef user-friendly identifier for the extension version (publisher-id/extension-id@1.0.0)
 * @param packageUri public URI of the extension archive (zip or tarball)
 * @param extensionRoot root directory that contains this extension, defaults to "/".
 */
export async function createExtensionVersionFromLocalSource(args: {
  extensionVersionRef: string;
  packageUri: string;
  extensionRoot?: string;
}): Promise<ExtensionVersion> {
  const ref = refs.parse(args.extensionVersionRef);
  if (!ref.version) {
    throw new FirebaseError(
      `Extension version ref "${args.extensionVersionRef}" must supply a version.`
    );
  }
  // TODO(b/185176470): Publishing an extension with a previously deleted name will return 409.
  // Need to surface a better error, potentially by calling getExtension.
  const uploadRes = await extensionsPublisherApiClient.post<
    {
      versionId: string;
      extensionRoot: string;
      remoteArchiveSource: {
        packageUri: string;
      };
    },
    ExtensionVersion
  >(`/${refs.toExtensionName(ref)}/versions:createFromSource`, {
    versionId: ref.version,
    extensionRoot: args.extensionRoot ?? "/",
    remoteArchiveSource: {
      packageUri: args.packageUri,
    },
  });
  const pollRes = await operationPoller.pollOperation<ExtensionVersion>({
    apiOrigin: extensionsPublisherOrigin,
    apiVersion: PUBLISHER_API_VERSION,
    operationResourceName: uploadRes.body.name,
    masterTimeout: 600000,
  });
  return pollRes;
}

/**
 * @param extensionVersionRef user-friendly identifier for the extension version (publisher-id/extension-id@1.0.0)
 * @param repoUri public GitHub repo URI that contains the extension source
 * @param sourceRef commit hash, branch, or tag to build from the repo
 * @param extensionRoot root directory that contains this extension, defaults to "/".
 */
export async function createExtensionVersionFromGitHubSource(args: {
  extensionVersionRef: string;
  repoUri: string;
  sourceRef: string;
  extensionRoot?: string;
}): Promise<ExtensionVersion> {
  const ref = refs.parse(args.extensionVersionRef);
  if (!ref.version) {
    throw new FirebaseError(
      `Extension version ref "${args.extensionVersionRef}" must supply a version.`
    );
  }
  // TODO(b/185176470): Publishing an extension with a previously deleted name will return 409.
  // Need to surface a better error, potentially by calling getExtension.
  const uploadRes = await extensionsPublisherApiClient.post<
    {
      versionId: string;
      extensionRoot: string;
      githubRepositorySource: {
        uri: string;
        sourceRef: string;
      };
    },
    ExtensionVersion
  >(`/${refs.toExtensionName(ref)}/versions:createFromSource`, {
    versionId: ref.version,
    extensionRoot: args.extensionRoot ?? "/",
    githubRepositorySource: {
      uri: args.repoUri,
      sourceRef: args.sourceRef,
    },
  });
  const pollRes = await operationPoller.pollOperation<ExtensionVersion>({
    apiOrigin: extensionsPublisherOrigin,
    apiVersion: PUBLISHER_API_VERSION,
    operationResourceName: uploadRes.body.name,
    masterTimeout: 600000,
  });
  return pollRes;
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
  try {
    await extensionsApiClient.delete(`/${refs.toExtensionName(ref)}`);
  } catch (err: any) {
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
    const res = await extensionsApiClient.get<Extension>(`/${refs.toExtensionName(ref)}`);
    return res.body;
  } catch (err: any) {
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

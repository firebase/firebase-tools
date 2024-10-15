import * as yaml from "yaml";
import * as clc from "colorette";

import { Client } from "../apiv2";
import { extensionsOrigin } from "../api";
import { FirebaseError, getErrMsg, getErrStatus } from "../error";
import { logger } from "../logger";
import * as operationPoller from "../operation-poller";
import * as refs from "./refs";
import {
  Extension,
  ExtensionInstance,
  ExtensionSource,
  ExtensionSpec,
  ExtensionVersion,
  isExtensionInstance,
} from "./types";

const EXTENSIONS_API_VERSION = "v1beta";
const PAGE_SIZE_MAX = 100;

const extensionsApiClient = new Client({
  urlPrefix: extensionsOrigin(),
  apiVersion: EXTENSIONS_API_VERSION,
});

/**
 * Create a new extension instance, given a extension source path or extension reference, a set of params, and a service account.
 * @param projectId the project to create the instance in
 * @param instanceId the id to set for the instance
 * @param config instance configuration
 * @param labels labels for the instance
 * @param validateOnly if true we only perform validation, not the actual creation
 */
async function createInstanceHelper(
  projectId: string,
  instanceId: string,
  config: Record<string, unknown>,
  labels: Record<string, string> | undefined,
  validateOnly = false,
): Promise<ExtensionInstance> {
  const createRes = await extensionsApiClient.post<
    { name: string; config: unknown; labels: Record<string, string> | undefined },
    ExtensionInstance
  >(
    `/projects/${projectId}/instances/`,
    {
      name: `projects/${projectId}/instances/${instanceId}`,
      config,
      labels,
    },
    {
      queryParams: {
        validateOnly: validateOnly ? "true" : "false",
      },
    },
  );
  if (validateOnly) {
    return createRes.body;
  }
  const pollRes = await operationPoller.pollOperation<ExtensionInstance>({
    apiOrigin: extensionsOrigin(),
    apiVersion: EXTENSIONS_API_VERSION,
    operationResourceName: createRes.body.name,
    masterTimeout: 3600000,
  });
  return pollRes;
}

export type CreateInstanceArgs = {
  projectId: string;
  instanceId: string;
  extensionSource?: ExtensionSource;
  extensionVersionRef?: string;
  params: Record<string, string>;
  systemParams?: Record<string, string>;
  allowedEventTypes?: string[];
  eventarcChannel?: string;
  validateOnly?: boolean;
  labels?: Record<string, string>;
};

/**
 * Create a new extension instance, given a extension source path, a set of params, and a service account.
 * @param args the args for creating the instance
 */
export async function createInstance(args: CreateInstanceArgs): Promise<ExtensionInstance> {
  const config: Record<string, unknown> = {
    params: args.params,
    systemParams: args.systemParams ?? {},
    allowedEventTypes: args.allowedEventTypes,
    eventarcChannel: args.eventarcChannel,
  };

  if (args.extensionSource && args.extensionVersionRef) {
    throw new FirebaseError(
      "ExtensionSource and ExtensionVersion both provided, but only one should be.",
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
  return await createInstanceHelper(
    args.projectId,
    args.instanceId,
    config,
    args.labels,
    args.validateOnly,
  );
}

/**
 * Delete an instance and all of the associated resources and its service account.
 * @param projectId the project where the instance exists
 * @param instanceId the id of the instance to delete
 */
export async function deleteInstance(projectId: string, instanceId: string): Promise<unknown> {
  const deleteRes = await extensionsApiClient.delete<{ name: string }>(
    `/projects/${projectId}/instances/${instanceId}`,
  );
  const pollRes = await operationPoller.pollOperation({
    apiOrigin: extensionsOrigin(),
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
export async function getInstance(
  projectId: string,
  instanceId: string,
): Promise<ExtensionInstance | undefined> {
  try {
    const res = await extensionsApiClient.get(`/projects/${projectId}/instances/${instanceId}`);
    if (isExtensionInstance(res.body)) {
      return res.body;
    }
  } catch (err: unknown) {
    if (getErrStatus(err) === 404) {
      throw new FirebaseError(
        `Extension instance '${clc.bold(instanceId)}' not found in project '${clc.bold(
          projectId,
        )}'.`,
        { status: 404 },
      );
    }
    throw err;
  }
}

/**
 * Returns a list of all installed extension instances on the project with projectId.
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
 * @param args the args to configure the instance
 * @param args.projectId the project the instance is in
 * @param args.instanceId the id of the instance to configure
 * @param args.params params to configure the extension instance
 * @param args.systemParams system params to configure the extension instance
 * @param args.canEmitEvents if the instance can emit events
 * @param args.allowedEventTypes types of events (selected by consumer) that the extension is allowed to emit
 * @param args.eventarcChannel fully qualified eventarc channel resource name to emit events to
 * @param args.validateOnly if true, only validates the update and makes no changes
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
}): Promise<unknown> {
  const reqBody = {
    projectId: args.projectId,
    instanceId: args.instanceId,
    updateMask: "config.params",
    validateOnly: args.validateOnly ?? false,
    data: {
      config: {
        params: args.params,
      } as Record<string, unknown>,
    },
  };
  if (args.canEmitEvents) {
    if (args.allowedEventTypes === undefined || args.eventarcChannel === undefined) {
      throw new FirebaseError(
        `This instance is configured to emit events, but either allowed event types or eventarc channel is undefined.`,
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
 * @param args The update instance args
 * @param args.projectId the project the instance is in
 * @param args.instanceId the id of the instance to configure
 * @param args.extensionSource the source for the version of the extension to update to
 * @param args.params params to update the extension instance
 * @param args.systemParams system params to update the extension instance
 * @param args.canEmitEvents if the instance can emit events
 * @param args.allowedEventTypes types of events (selected by consumer) that the extension is allowed to emit
 * @param args.eventarcChannel fully qualified eventarc channel resource name to emit events to
 * @param args.validateOnly if true, only validates the update and makes no changes
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
}): Promise<unknown> {
  const body: Record<string, Record<string, unknown>> = {
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
        `This instance is configured to emit events, but either allowed event types or eventarc channel is undefined.`,
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
 * @param args the update args
 * @param args.projectId the project the instance is in
 * @param args.instanceId the id of the instance to configure
 * @param args.extRef reference for the extension to update to
 * @param args.params params to configure the extension instance
 * @param args.systemParams system params to configure the extension instance
 * @param args.canEmitEvents if the instance can emit events
 * @param args.allowedEventTypes types of events (selected by consumer) that the extension is allowed to emit
 * @param args.eventarcChannel fully qualified eventarc channel resource name to emit events to
 * @param args.validateOnly if true, only validates the update and makes no changes
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
}): Promise<unknown> {
  const ref = refs.parse(args.extRef);
  const body: Record<string, Record<string, unknown>> = {
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
        `This instance is configured to emit events, but either allowed event types or eventarc channel is undefined.`,
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
  data: unknown;
}): Promise<unknown> {
  const updateRes = await extensionsApiClient.patch<unknown, { name: string }>(
    `/projects/${args.projectId}/instances/${args.instanceId}`,
    args.data,
    {
      queryParams: {
        updateMask: args.updateMask,
        validateOnly: args.validateOnly ? "true" : "false",
      },
    },
  );
  if (args.validateOnly) {
    return updateRes;
  }
  const pollRes = await operationPoller.pollOperation({
    apiOrigin: extensionsOrigin(),
    apiVersion: EXTENSIONS_API_VERSION,
    operationResourceName: updateRes.body.name,
    masterTimeout: 600000,
  });
  return pollRes;
}

/**
 * populates the spec by parsing yaml properties into real properties
 * @param spec The spec to populate
 */
export function populateSpec(spec: ExtensionSpec): void {
  if (spec) {
    for (const r of spec.resources) {
      try {
        if (r.propertiesYaml) {
          r.properties = yaml.parse(r.propertiesYaml);
        }
      } catch (err: unknown) {
        logger.debug(`[ext] failed to parse resource properties yaml: ${getErrMsg(err)}`);
      }
    }
    // We need to populate empty repeated fields with empty arrays, since proto wire format removes them.
    spec.params = spec.params ?? [];
    spec.systemParams = spec.systemParams ?? [];
  }
}

/**
 * Create a new extension source
 * @param projectId The project to create the source in
 * @param packageUri A URI for a zipper archive of a extension source
 * @param extensionRoot A directory inside the archive to look for extension.yaml
 */
export async function createSource(
  projectId: string,
  packageUri: string,
  extensionRoot: string,
): Promise<ExtensionSource> {
  const createRes = await extensionsApiClient.post<
    { packageUri: string; extensionRoot: string },
    ExtensionSource
  >(`/projects/${projectId}/sources/`, {
    packageUri,
    extensionRoot,
  });
  const pollRes = await operationPoller.pollOperation<ExtensionSource>({
    apiOrigin: extensionsOrigin(),
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
 * @param extensionVersionRef user-friendly identifier for the ExtensionVersion (publisher-id/extension-id@1.0.0)
 */
export async function getExtensionVersion(extensionVersionRef: string): Promise<ExtensionVersion> {
  const ref = refs.parse(extensionVersionRef);
  if (!ref.version) {
    throw new FirebaseError(`ExtensionVersion ref "${extensionVersionRef}" must supply a version.`);
  }
  try {
    const res = await extensionsApiClient.get<ExtensionVersion>(
      `/${refs.toExtensionVersionName(ref)}`,
    );
    if (res.body.spec) {
      populateSpec(res.body.spec);
    }
    return res.body;
  } catch (err: unknown) {
    if (getErrStatus(err) === 404) {
      throw refNotFoundError(ref);
    } else if (err instanceof FirebaseError) {
      throw err;
    }
    throw new FirebaseError(
      `Failed to query the extension version '${clc.bold(extensionVersionRef)}': ${getErrMsg(err)}`,
    );
  }
}

/**
 * @param publisherId the publisher for which we are listing Extensions
 */
export async function listExtensions(publisherId: string): Promise<Extension[]> {
  const extensions: Extension[] = [];
  const getNextPage = async (pageToken = ""): Promise<void> => {
    const res = await extensionsApiClient.get<{ extensions: Extension[]; nextPageToken: string }>(
      `/publishers/${publisherId}/extensions`,
      {
        queryParams: {
          pageSize: PAGE_SIZE_MAX,
          pageToken,
        },
      },
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
  showPrereleases = false,
): Promise<ExtensionVersion[]> {
  const { publisherId, extensionId } = refs.parse(ref);
  const extensionVersions: ExtensionVersion[] = [];
  const getNextPage = async (pageToken = ""): Promise<void> => {
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
 * @param extensionRef user-friendly identifier for the Extension (publisher-id/extension-id)
 * @return the extension
 */
export async function getExtension(extensionRef: string): Promise<Extension> {
  const ref = refs.parse(extensionRef);
  try {
    const res = await extensionsApiClient.get<Extension>(`/${refs.toExtensionName(ref)}`);
    return res.body;
  } catch (err: unknown) {
    if (getErrStatus(err) === 404) {
      throw refNotFoundError(ref);
    } else if (err instanceof FirebaseError) {
      throw err;
    }
    throw new FirebaseError(
      `Failed to query the extension '${clc.bold(extensionRef)}': ${getErrMsg(err)}`,
      {
        status: getErrStatus(err),
      },
    );
  }
}

/**
 * refNotFoundError returns a nicely formatted error when a reference is not found
 * @param ref The reference that is missing
 * @return a formatted FirebaseError
 */
export function refNotFoundError(ref: refs.Ref): FirebaseError {
  return new FirebaseError(
    `The extension reference '${clc.bold(
      ref.version ? refs.toExtensionVersionRef(ref) : refs.toExtensionRef(ref),
    )}' doesn't exist. This could happen for two reasons:\n` +
      `  -The publisher ID '${clc.bold(ref.publisherId)}' doesn't exist or could be misspelled\n` +
      `  -The name of the ${ref.version ? "extension version" : "extension"} '${clc.bold(
        ref.version ? `${ref.extensionId}@${ref.version}` : ref.extensionId,
      )}' doesn't exist or could be misspelled\n\n` +
      `Please correct the extension reference and try again. If you meant to reference an extension from a local source, please provide a relative path prefixed with '${clc.bold(
        "./",
      )}', '${clc.bold("../")}', or '${clc.bold("~/")}'.}`,
    { status: 404 },
  );
}

import * as clc from "colorette";

import * as operationPoller from "../operation-poller";
import * as refs from "./refs";

import { extensionsPublisherOrigin } from "../api";
import { Client } from "../apiv2";
import { FirebaseError } from "../error";
import { populateSpec, refNotFoundError } from "./extensionsApi";
import { Extension, ExtensionVersion, PublisherProfile } from "./types";

const PUBLISHER_API_VERSION = "v1beta";
const PAGE_SIZE_MAX = 100;

const extensionsPublisherApiClient = new Client({
  urlPrefix: extensionsPublisherOrigin,
  apiVersion: PUBLISHER_API_VERSION,
});

/**
 * @param projectId the project for which we are registering a PublisherProfile
 * @param publisherId the desired publisher ID
 */
export async function getPublisherProfile(
  projectId: string,
  publisherId?: string,
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
  publisherId: string,
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
    },
  );
  return res.body;
}

/**
 * @param extensionRef user-friendly identifier for the ExtensionVersion (publisher-id/extension-id@version)
 * @param deprecationMessage the deprecation message
 */
export async function deprecateExtensionVersion(
  extensionRef: string,
  deprecationMessage: string,
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
          extensionRef,
        )}' and don’t have the correct permissions to deprecate this extension version.` + err,
        { status: err.status },
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
      },
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
      `/${refs.toExtensionVersionName(ref)}:undeprecate`,
    );
    return res.body;
  } catch (err: any) {
    if (err.status === 403) {
      throw new FirebaseError(
        `You are not the owner of extension '${clc.bold(
          extensionRef,
        )}' and don’t have the correct permissions to undeprecate this extension version.`,
        { status: err.status },
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
      },
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
      `Extension version ref "${args.extensionVersionRef}" must supply a version.`,
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
      `Extension version ref "${args.extensionVersionRef}" must supply a version.`,
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
    extensionRoot: args.extensionRoot || "/",
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
 * @param ref user-friendly identifier for the ExtensionVersion (publisher-id/extension-id@1.0.0)
 */
export async function getExtensionVersion(extensionVersionRef: string): Promise<ExtensionVersion> {
  const ref = refs.parse(extensionVersionRef);
  if (!ref.version) {
    throw new FirebaseError(`ExtensionVersion ref "${extensionVersionRef}" must supply a version.`);
  }
  try {
    const res = await extensionsPublisherApiClient.get<ExtensionVersion>(
      `/${refs.toExtensionVersionName(ref)}`,
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
      `Failed to query the extension version '${clc.bold(extensionVersionRef)}': ${err}`,
    );
  }
}

/**
 * @param publisherId the publisher for which we are listing Extensions
 */
export async function listExtensions(publisherId: string): Promise<Extension[]> {
  const extensions: Extension[] = [];
  const getNextPage = async (pageToken = "") => {
    const res = await extensionsPublisherApiClient.get<{
      extensions: Extension[];
      nextPageToken: string;
    }>(`/publishers/${publisherId}/extensions`, {
      queryParams: {
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
 */
export async function listExtensionVersions(
  ref: string,
  filter = "",
  showPrereleases = false,
): Promise<ExtensionVersion[]> {
  const { publisherId, extensionId } = refs.parse(ref);
  const extensionVersions: ExtensionVersion[] = [];
  const getNextPage = async (pageToken = "") => {
    const res = await extensionsPublisherApiClient.get<{
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
 * @param ref user-friendly identifier for the Extension (publisher-id/extension-id)
 * @return the extension
 */
export async function getExtension(extensionRef: string): Promise<Extension> {
  const ref = refs.parse(extensionRef);
  try {
    const res = await extensionsPublisherApiClient.get<Extension>(`/${refs.toExtensionName(ref)}`);
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

import { FirebaseError } from "../error";
import { hostingApiOrigin } from "../api";
import { Client } from "../apiv2";
import * as operationPoller from "../operation-poller";
import { DEFAULT_DURATION } from "../hosting/expireUtils";
import { getAuthDomains, updateAuthDomains } from "../gcp/auth";
import * as proto from "../gcp/proto";
import { getHostnameFromUrl } from "../utils";

const ONE_WEEK_MS = 604800000; // 7 * 24 * 60 * 60 * 1000

interface ActingUser {
  // The email address of the user when the user performed the action.
  email: string;

  // A profile image URL for the user. May not be present if the user has
  // changed their email address or deleted their account.
  imageUrl?: string;
}

enum ReleaseType {
  // An unspecified type. Indicates that a version was released.
  // This is the default value when no other `type` is explicitly
  // specified.
  TYPE_UNSPECIFIED = "TYPE_UNSPECIFIED",
  // A version was uploaded to Firebase Hosting and released.
  DEPLOY = "DEPLOY",
  // The release points back to a previously deployed version.
  ROLLBACK = "ROLLBACK",
  // The release prevents the site from serving content. Firebase Hosting acts
  // as if the site never existed.
  SITE_DISABLE = "SITE_DISABLE",
}

export interface Release {
  // The unique identifier for the release, in the format:
  // <code>sites/<var>site-name</var>/releases/<var>releaseID</var></code>
  readonly name: string;

  // The configuration and content that was released.
  // TODO: create a Version type interface.
  readonly version: Version;

  // Explains the reason for the release.
  // Specify a value for this field only when creating a `SITE_DISABLE`
  // type release.
  type: ReleaseType;

  // The time at which the version is set to be public.
  readonly releaseTime: string;

  // Identifies the user who created the release.
  readonly releaseUser: ActingUser;

  // The deploy description when the release was created. The value can be up to
  // 512 characters.
  message: string;
}

export interface Channel {
  // The fully-qualified identifier of the Channel.
  name: string;

  // The URL at which the channel can be viewed. For the `live`
  // channel, the content of the current release may also be visible at other
  // URLs.
  readonly url: string;

  // The current release for the channel, if any.
  readonly release: Release | undefined;

  // The time at which the channel was created.
  readonly createTime: string;

  // The time at which the channel was last updated.
  readonly updateTime: string;

  // The time at which the channel will  be automatically deleted. If null,
  // the channel will not be automatically deleted. This field is present
  // in output whether set directly or via the `ttl` field.
  readonly expireTime: string;

  // The number of previous releases to retain on the channel for rollback or
  // other purposes. Must be a number between 1-100. Defaults to 10 for new
  // channels.
  retainedReleaseCount: number;

  // Text labels used for extra metadata and/or filtering.
  labels: { [key: string]: string };
}

export interface Domain {
  site: `projects/${string}/sites/${string}`;
  domainName: string;
  updateTime: string;
  provisioning?: {
    certStatus: string;
    dnsStatus: string;
    expectedIps: string[];
  };
  status: string;
  domainRedirect?: {
    domainName: string;
    type: string;
  };
}

export type VersionStatus =
  // The version has been created, and content is currently being added to the
  // version.
  | "CREATED"
  // All content has been added to the version, and the version can no longer be
  // changed.
  | "FINALIZED"
  // The version has been deleted.
  | "DELETED"
  // The version was not updated to `FINALIZED` within 12&nbsp;hours and was
  // automatically deleted.
  | "ABANDONED"
  // The version is outside the site-configured limit for the number of
  // retained versions, so the version's content is scheduled for deletion.
  | "EXPIRED"
  // The version is being cloned from another version. All content is still
  // being copied over.
  | "CLONING";

export type HasPattern = { glob: string } | { regex: string };

export type Header = HasPattern & {
  regex?: string;
  headers: Record<string, string>;
};

export type Redirect = HasPattern & {
  statusCode?: number;
  location: string;
};

export interface RunRewrite {
  serviceId: string;
  region: string;
  tag?: string;
}

export type RewriteBehavior =
  | { path: string }
  | { function: string; functionRegion?: string }
  | { dynamicLinks: true }
  | { run: RunRewrite };

export type Rewrite = HasPattern & RewriteBehavior;

export interface ServingConfig {
  headers?: Header[];
  redirects?: Redirect[];
  rewrites?: Rewrite[];
  cleanUrls?: boolean;
  trailingSlashBehavior?: "ADD" | "REMOVE";
  appAssociation?: "AUTO" | "NONE";
  i18n?: { root: string };
}

export interface Version {
  // The unique identifier for a version, in the format:
  // `sites/<site-name>/versions/<versionID>`
  name: string;

  // The deploy status of a version.
  status: VersionStatus;

  // The configuration for the behavior of the site.
  config?: ServingConfig;

  // The labels used for extra metadata and/or filtering.
  labels?: Record<string, string>;

  // The time at which the version was created.
  readonly createTime: string;

  // Identifies the user who created the version.
  readonly createUser: ActingUser;

  // The time at which the version was `FINALIZED`.
  readonly finalizeTime?: string;

  // Identifies the user who `FINALIZED` the version.
  readonly finalizeUser?: ActingUser;

  // The time at which the version was `DELETED`.
  readonly deleteTime?: string;

  // Identifies the user who `DELETED` the version.
  readonly deleteUser?: ActingUser;

  // The total number of files associated with the version.
  readonly fileCount: number;

  // The total stored bytesize of the version.
  readonly versionBytes: number;
}

export type VERSION_OUTPUT_FIELDS =
  | "name"
  | "createTime"
  | "createUser"
  | "finalizeTime"
  | "finalizeUser"
  | "deleteTime"
  | "deleteUser"
  | "fileCount"
  | "versionBytes";

interface CloneVersionRequest {
  // The name of the version to be cloned, in the format:
  // `sites/{site}/versions/{version}`
  sourceVersion: string;

  // If true, immediately finalize the version after cloning is complete.
  finalize?: boolean;
}

interface LongRunningOperation<T> {
  // The identifier of the Operation.
  readonly name: string;

  // Set to `true` if the Operation is done.
  readonly done: boolean;

  // Additional metadata about the Operation.
  readonly metadata: T | undefined;
}

// The possible types of a site.
export enum SiteType {
  // Unknown state, likely the result of an error on the backend.
  TYPE_UNSPECIFIED = "TYPE_UNSPECIFIED",

  // The default Hosting site that is provisioned when a Firebase project is
  // created.
  DEFAULT_SITE = "DEFAULT_SITE",

  // A Hosting site that the user created.
  USER_SITE = "USER_SITE",
}

export type Site = {
  // Fully qualified name of the site.
  name: string;

  readonly defaultUrl: string;

  readonly appId: string;

  readonly type?: SiteType;

  labels: { [key: string]: string };
};

/**
 * normalizeName normalizes a name given to it. Most useful for normalizing
 * user provided names. This removes any `/`, ':', '_', or '#' characters and
 * replaces them with dashes (`-`).
 * @param s the name to normalize.
 * @return the normalized name.
 */
export function normalizeName(s: string): string {
  // Using a regex replaces *all* specified characters at once.
  return s.replace(/[/:_#]/g, "-");
}

const apiClient = new Client({
  urlPrefix: hostingApiOrigin,
  apiVersion: "v1beta1",
  auth: true,
});

/**
 * getChannel retrieves information about a channel.
 * @param project the project ID or number (can be provided `-`),
 * @param site the site for the channel.
 * @param channelId the specific channel ID.
 * @return the channel, or null if the channel is not found.
 */
export async function getChannel(
  project: string | number = "-",
  site: string,
  channelId: string,
): Promise<Channel | null> {
  try {
    const res = await apiClient.get<Channel>(
      `/projects/${project}/sites/${site}/channels/${channelId}`,
    );
    return res.body;
  } catch (e: unknown) {
    if (e instanceof FirebaseError && e.status === 404) {
      return null;
    }
    throw e;
  }
}

/**
 * listChannels retrieves information about a channel.
 * @param project the project ID or number (can be provided `-`),
 * @param site the site for the channel.
 */
export async function listChannels(
  project: string | number = "-",
  site: string,
): Promise<Channel[]> {
  const channels: Channel[] = [];
  let nextPageToken = "";
  for (;;) {
    try {
      const res = await apiClient.get<{ nextPageToken?: string; channels?: Channel[] }>(
        `/projects/${project}/sites/${site}/channels`,
        { queryParams: { pageToken: nextPageToken, pageSize: 10 } },
      );
      channels.push(...(res.body.channels ?? []));
      nextPageToken = res.body.nextPageToken || "";
      if (!nextPageToken) {
        return channels;
      }
    } catch (e: unknown) {
      if (e instanceof FirebaseError && e.status === 404) {
        throw new FirebaseError(`could not find channels for site "${site}"`, {
          original: e,
        });
      }
      throw e;
    }
  }
}

/**
 * Creates a Channel.
 * @param project the project ID or number (can be provided `-`),
 * @param site the site for the channel.
 * @param channelId the specific channel ID.
 * @param ttlMillis the duration from now to set the expireTime.
 */
export async function createChannel(
  project: string | number = "-",
  site: string,
  channelId: string,
  ttlMillis: number = DEFAULT_DURATION,
): Promise<Channel> {
  const res = await apiClient.post<{ ttl: string }, Channel>(
    `/projects/${project}/sites/${site}/channels?channelId=${channelId}`,
    { ttl: `${ttlMillis / 1000}s` },
  );
  return res.body;
}

/**
 * Updates a channel's TTL.
 * @param project the project ID or number (can be provided `-`),
 * @param site the site for the channel.
 * @param channelId the specific channel ID.
 * @param ttlMillis the duration from now to set the expireTime.
 */
export async function updateChannelTtl(
  project: string | number = "-",
  site: string,
  channelId: string,
  ttlMillis: number = ONE_WEEK_MS,
): Promise<Channel> {
  const res = await apiClient.patch<{ ttl: string }, Channel>(
    `/projects/${project}/sites/${site}/channels/${channelId}`,
    { ttl: `${ttlMillis / 1000}s` },
    { queryParams: { updateMask: "ttl" } },
  );
  return res.body;
}

/**
 * Deletes a channel.
 * @param project the project ID or number (can be provided `-`),
 * @param site the site for the channel.
 * @param channelId the specific channel ID.
 */
export async function deleteChannel(
  project: string | number = "-",
  site: string,
  channelId: string,
): Promise<void> {
  await apiClient.delete(`/projects/${project}/sites/${site}/channels/${channelId}`);
}

/**
 * Creates a version
 */
export async function createVersion(
  siteId: string,
  version: Omit<Version, VERSION_OUTPUT_FIELDS>,
): Promise<string> {
  const res = await apiClient.post<typeof version, { name: string }>(
    `projects/-/sites/${siteId}/versions`,
    version,
  );
  return res.body.name;
}

/**
 * Updates a version.
 */
export async function updateVersion(
  site: string,
  versionId: string,
  version: Partial<Version>,
): Promise<Version> {
  const res = await apiClient.patch<Partial<Version>, Version>(
    `projects/-/sites/${site}/versions/${versionId}`,
    version,
    {
      queryParams: {
        // N.B. It's not clear why we need "config". If the Hosting server acted
        // like a normal OP service, we could update config.foo and config.bar
        // in a PATCH command even if config was the empty object already. But
        // not setting config in createVersion and then setting config subfields
        // in updateVersion is failing with
        // "HTTP Error: 40 Unknown path in `updateMask`: `config.rewrites`"
        updateMask: proto.fieldMasks(version, "labels", "config").join(","),
      },
    },
  );
  return res.body;
}

interface ListVersionsResponse {
  versions?: Version[];
  nextPageToken?: string;
}

/**
 * Get a list of all versions for a site, automatically handling pagination.
 */
export async function listVersions(site: string): Promise<Version[]> {
  let pageToken: string | undefined = undefined;
  const versions: Version[] = [];
  do {
    const queryParams: Record<string, string> = {};
    if (pageToken) {
      queryParams.pageToken = pageToken;
    }
    const res = await apiClient.get<ListVersionsResponse>(`projects/-/sites/${site}/versions`, {
      queryParams,
    });
    versions.push(...(res.body.versions ?? []));
    pageToken = res.body.nextPageToken;
  } while (pageToken);
  return versions;
}

/**
 * Create a version a clone.
 * @param site the site for the version.
 * @param versionName the specific version ID.
 * @param finalize whether or not to immediately finalize the version.
 */
export async function cloneVersion(
  site: string,
  versionName: string,
  finalize = false,
): Promise<Version> {
  const res = await apiClient.post<CloneVersionRequest, LongRunningOperation<Version>>(
    `/projects/-/sites/${site}/versions:clone`,
    {
      sourceVersion: versionName,
      finalize,
    },
  );
  const { name: operationName } = res.body;
  const pollRes = await operationPoller.pollOperation<Version>({
    apiOrigin: hostingApiOrigin,
    apiVersion: "v1beta1",
    operationResourceName: operationName,
    masterTimeout: 600000,
  });
  return pollRes;
}

type PartialRelease = Partial<Pick<Release, "message" | "type">>;

/**
 * Create a release on a channel.
 * @param site the site for the version.
 * @param channel the channel for the release.
 * @param version the specific version ID.
 */
export async function createRelease(
  site: string,
  channel: string,
  version: string,
  partialRelease?: PartialRelease,
): Promise<Release> {
  const res = await apiClient.post<PartialRelease, Release>(
    `/projects/-/sites/${site}/channels/${channel}/releases`,
    partialRelease,
    { queryParams: { versionName: version } },
  );
  return res.body;
}

/**
 * List the Hosting sites for a given project.
 * @param project project name or number.
 * @return list of Sites.
 */
export async function listSites(project: string): Promise<Site[]> {
  const sites: Site[] = [];
  let nextPageToken = "";
  for (;;) {
    try {
      const res = await apiClient.get<{ sites?: Site[]; nextPageToken?: string }>(
        `/projects/${project}/sites`,
        { queryParams: { pageToken: nextPageToken, pageSize: 10 } },
      );
      sites.push(...(res.body.sites ?? []));
      nextPageToken = res.body.nextPageToken || "";
      if (!nextPageToken) {
        return sites;
      }
    } catch (e: unknown) {
      if (e instanceof FirebaseError && e.status === 404) {
        throw new FirebaseError(`could not find sites for project "${project}"`, {
          original: e,
        });
      }
      throw e;
    }
  }
}

/**
 * Get a Hosting site.
 * @param project project name or number.
 * @param site site name.
 * @return site information.
 */
export async function getSite(project: string, site: string): Promise<Site> {
  try {
    const res = await apiClient.get<Site>(`/projects/${project}/sites/${site}`);
    return res.body;
  } catch (e: unknown) {
    if (e instanceof FirebaseError && e.status === 404) {
      throw new FirebaseError(`could not find site "${site}" for project "${project}"`, {
        original: e,
        status: e.status,
      });
    }
    throw e;
  }
}

/**
 * Create a Hosting site.
 * @param project project name or number.
 * @param site the site name to create.
 * @param appId the Firebase Web App ID (https://firebase.google.com/docs/projects/learn-more#config-files-objects)
 * @return site information.
 */
export async function createSite(
  project: string,
  site: string,
  appId = "",
  validateOnly = false,
): Promise<Site> {
  const queryParams: Record<string, string> = { siteId: site };
  if (validateOnly) {
    queryParams.validateOnly = "true";
  }
  const res = await apiClient.post<{ appId: string }, Site>(
    `/projects/${project}/sites`,
    { appId: appId },
    { queryParams },
  );
  return res.body;
}

/**
 * Update a Hosting site.
 * @param project project name or number.
 * @param site the site to update.
 * @param fields the fields to update.
 * @return site information.
 */
export async function updateSite(project: string, site: Site, fields: string[]): Promise<Site> {
  const res = await apiClient.patch<Site, Site>(`/projects/${project}/sites/${site.name}`, site, {
    queryParams: { updateMask: fields.join(",") },
  });
  return res.body;
}

/**
 * Delete a Hosting site.
 * @param project project name or number.
 * @param site the site to update.
 * @return nothing.
 */
export async function deleteSite(project: string, site: string): Promise<void> {
  await apiClient.delete<void>(`/projects/${project}/sites/${site}`);
}

/**
 * Adds list of channel domains to Firebase Auth list.
 * @param project the project ID.
 * @param urls the list of urls of the channel.
 */
export async function addAuthDomains(project: string, urls: string[]): Promise<string[]> {
  const domains = await getAuthDomains(project);
  const authDomains = domains || [];
  for (const url of urls) {
    const domain = url.replace("https://", "");
    if (authDomains.includes(domain)) {
      continue;
    }
    authDomains.push(domain);
  }
  return await updateAuthDomains(project, authDomains);
}

/**
 * Removes channel domain from Firebase Auth list.
 * @param project the project ID.
 * @param url the url of the channel.
 */
export async function removeAuthDomain(project: string, url: string): Promise<string[]> {
  const domains = await getAuthDomains(project);
  if (!domains.length) {
    return domains;
  }
  const targetDomain = url.replace("https://", "");
  const authDomains = domains.filter((domain: string) => domain !== targetDomain);
  return updateAuthDomains(project, authDomains);
}

/**
 * Constructs a list of "clean domains"
 * by including all existing auth domains
 * with the exception of domains that belong to
 * expired channels.
 * @param project the project ID.
 * @param site the site for the channel.
 */
export async function getCleanDomains(project: string, site: string): Promise<string[]> {
  const channels = await listChannels(project, site);
  // Create a map of channel domain names
  const channelMap = channels
    .map((channel: Channel) => channel.url.replace("https://", ""))
    .reduce((acc: { [key: string]: boolean }, current: string) => {
      acc[current] = true;
      return acc;
    }, {});

  // match any string that starts with ${site}--*
  const siteMatch = new RegExp(`^${site}--`, "i");
  // match any string that ends in firebaseapp.com
  const firebaseAppMatch = new RegExp(/firebaseapp.com$/);
  const domains = await getAuthDomains(project);
  const authDomains: string[] = [];

  domains.forEach((domain: string) => {
    // include domains that end in *.firebaseapp.com because urls belonging
    // to the live channel should always be included
    const endsWithFirebaseApp = firebaseAppMatch.test(domain);
    if (endsWithFirebaseApp) {
      authDomains.push(domain);
      return;
    }
    // exclude site domains that have no channels
    const domainWithNoChannel = siteMatch.test(domain) && !channelMap[domain];
    if (domainWithNoChannel) {
      return;
    }
    // add all other domains (ex: "localhost", etc)
    authDomains.push(domain);
  });
  return authDomains;
}

/**
 * Retrieves a list of "clean domains" and
 * updates Firebase Auth Api with aforementioned
 * list.
 * @param project the project ID.
 * @param sites the list of sites for the channel.
 */
export async function cleanAuthState(
  project: string,
  sites: string[],
): Promise<Map<string, Array<string>>> {
  const siteDomainMap = new Map();
  for (const site of sites) {
    const authDomains = await getCleanDomains(project, site);
    const updatedDomains = await updateAuthDomains(project, authDomains);
    siteDomainMap.set(site, updatedDomains);
  }
  return siteDomainMap;
}

/**
 * Retrieves all site domains
 *
 * @param project project ID
 * @param site site id
 * @return array of domains
 */
export async function getSiteDomains(project: string, site: string): Promise<Domain[]> {
  try {
    const res = await apiClient.get<{ domains: Domain[] }>(
      `/projects/${project}/sites/${site}/domains`,
    );

    return res.body.domains ?? [];
  } catch (e: unknown) {
    if (e instanceof FirebaseError && e.status === 404) {
      throw new FirebaseError(`could not find site "${site}" for project "${project}"`, {
        original: e,
      });
    }
    throw e;
  }
}

/**
 * Join the default domain and the custom domains of a Hosting site
 *
 * @param projectId the project id
 * @param siteId the site id
 * @return array of domains
 */
export async function getAllSiteDomains(projectId: string, siteId: string): Promise<string[]> {
  const [hostingDomains, defaultDomain] = await Promise.all([
    getSiteDomains(projectId, siteId),
    getSite(projectId, siteId),
  ]);

  const defaultDomainWithoutHttp = defaultDomain.defaultUrl.replace(/^https?:\/\//, "");

  const allSiteDomains = new Set([
    ...hostingDomains.map(({ domainName }) => domainName),
    defaultDomainWithoutHttp,
    `${siteId}.web.app`,
    `${siteId}.firebaseapp.com`,
  ]);

  return Array.from(allSiteDomains);
}

/**
 * Get the deployment domain.
 * If hostingChannel is provided, get the channel url, otherwise get the
 * default site url.
 */
export async function getDeploymentDomain(
  projectId: string,
  siteId: string,
  hostingChannel?: string | undefined,
): Promise<string | null> {
  if (hostingChannel) {
    const channel = await getChannel(projectId, siteId, hostingChannel);

    return channel && getHostnameFromUrl(channel?.url);
  }

  const site = await getSite(projectId, siteId).catch((e: unknown) => {
    // return null if the site doesn't exist
    if (
      e instanceof FirebaseError &&
      e.original instanceof FirebaseError &&
      e.original.status === 404
    ) {
      return null;
    }

    throw e;
  });

  return site && getHostnameFromUrl(site?.defaultUrl);
}

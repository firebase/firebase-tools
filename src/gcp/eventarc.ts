import { Client } from "../apiv2";
import { eventarcOrigin } from "../api";
import { isEqual, last } from "lodash";
import { fieldMasks } from "./proto";
import { FirebaseError, getError } from "../error";

export const API_VERSION = "v1";

export interface Channel {
  name: string;

  /** Server-assigned uinique identifier. Format is a UUID4 */
  uid?: string;

  createTime?: string;
  updateTime?: string;

  /** If set, the channel will grant publish permissions to the 2P provider. */
  provider?: string;

  // BEGIN oneof transport
  pubsubTopic?: string;
  // END oneof transport

  state?: "PENDING" | "ACTIVE" | "INACTIVE";

  /** When the channel is `PENDING`, this token must be sent to the provider */
  activationToken?: string;

  cryptoKeyName?: string;
}

export interface EventFilter {
  attribute: string;
  value: string;
  operator?: "match-path-pattern";
}

export interface CloudRunDestination {
  service: string;
  region: string;
  path?: string;
}

export interface Trigger {
  name: string;
  eventFilters: EventFilter[];
  serviceAccount: string;
  destination: {
    cloudRun: CloudRunDestination;
  };
  channel?: string;
  labels?: Record<string, string>;
  eventDataContentType?: string;
  uid?: string;
  createTime?: string;
  updateTime?: string;
  state?: "PENDING" | "ACTIVE" | "INACTIVE";
}

export type TriggerUpdate = Pick<
  Trigger,
  "name" | "serviceAccount" | "destination" | "labels" | "eventDataContentType"
>;

interface OperationMetadata {
  createTime: string;
  target: string;
  verb: string;
  requestedCancellation: boolean;
  apiVersion: string;
}

export interface Operation {
  name: string;
  metadata: OperationMetadata;
  done: boolean;
}

const client = new Client({
  urlPrefix: eventarcOrigin(),
  auth: true,
  apiVersion: API_VERSION,
});

/**
 * Gets a Channel.
 */
export async function getChannel(name: string): Promise<Channel | undefined> {
  const res = await client.get<Channel>(name, { resolveOnHTTPError: true });
  if (res.status === 404) {
    return undefined;
  }
  return res.body;
}

/**
 * Creates a channel.
 */
export async function createChannel(channel: Channel): Promise<Operation> {
  // const body: Partial<Channel> = cloneDeep(channel);
  const pathParts = channel.name.split("/");

  const res = await client.post<Channel, Operation>(pathParts.slice(0, -1).join("/"), channel, {
    queryParams: { channelId: last(pathParts)! },
  });
  return res.body;
}

/**
 * Updates a channel to match the new spec.
 * Only set fields are updated.
 */
export async function updateChannel(channel: Channel): Promise<Channel> {
  const res = await client.put<Channel, Channel>(channel.name, channel, {
    queryParams: {
      updateMask: fieldMasks(channel).join(","),
    },
  });
  return res.body;
}

/**
 * Deletes a channel.
 */
export async function deleteChannel(name: string): Promise<void> {
  await client.delete(name);
}

/**
 * Gets an Eventarc trigger.
 */
export async function getTrigger(name: string): Promise<Trigger | undefined> {
  const res = await client.get<Trigger>(name, { resolveOnHTTPError: true });
  if (res.status === 404) {
    return undefined;
  }
  if (res.status >= 400) {
    throw new FirebaseError(`Failed to get Eventarc trigger ${name}. HTTP Error: ${res.status}`, {
      status: res.status,
      original: getError(res.body),
    });
  }
  return res.body;
}

/**
 * Creates an Eventarc trigger.
 */
export async function createTrigger(trigger: Trigger): Promise<Operation> {
  const pathParts = trigger.name.split("/");
  const res = await client.post<Trigger, Operation>(
    pathParts.slice(0, -2).join("/") + "/triggers",
    trigger,
    {
      queryParams: { triggerId: last(pathParts)! },
    },
  );
  return res.body;
}

/**
 * Updates the mutable fields of an Eventarc trigger.
 */
export async function updateTrigger(trigger: TriggerUpdate): Promise<Operation> {
  const res = await client.patch<TriggerUpdate, Operation>(trigger.name, trigger, {
    queryParams: {
      updateMask: ["serviceAccount", "destination", "labels", "eventDataContentType"].join(","),
    },
  });
  return res.body;
}

/**
 * Deletes an Eventarc trigger.
 */
export async function deleteTrigger(name: string): Promise<Operation> {
  const res = await client.delete<Operation>(name);
  return res.body;
}

/**
 * Checks whether changing a trigger requires deleting and recreating it.
 */
export function triggerRequiresReplacement(existing: Trigger, desired: Trigger): boolean {
  const normalizedFilters = (filters: EventFilter[]): EventFilter[] =>
    [...(filters || [])].sort((left, right) => {
      const leftKey = `${left.attribute}\0${left.operator || ""}\0${left.value}`;
      const rightKey = `${right.attribute}\0${right.operator || ""}\0${right.value}`;
      return leftKey.localeCompare(rightKey);
    });

  const channelMatches = desired.channel
    ? existing.channel === desired.channel
    : !existing.channel || existing.channel.endsWith("/channels/googleChannel");

  return (
    !isEqual(normalizedFilters(existing.eventFilters), normalizedFilters(desired.eventFilters)) ||
    !channelMatches
  );
}

/**
 * Checks whether all managed fields of an Eventarc trigger match.
 */
export function triggerMatches(existing: Trigger, desired: Trigger): boolean {
  const normalizedPath = (path?: string): string => (path === "/" ? "" : path || "");
  const existingCloudRun = existing.destination?.cloudRun;
  if (!existingCloudRun) {
    return false;
  }
  const destinationMatches =
    existingCloudRun.service === desired.destination.cloudRun.service &&
    existingCloudRun.region === desired.destination.cloudRun.region &&
    normalizedPath(existingCloudRun.path) === normalizedPath(desired.destination.cloudRun.path);

  return (
    !triggerRequiresReplacement(existing, desired) &&
    existing.serviceAccount === desired.serviceAccount &&
    destinationMatches &&
    existing.eventDataContentType === desired.eventDataContentType &&
    Object.entries(desired.labels || {}).every(([key, value]) => existing.labels?.[key] === value)
  );
}

/** Removes output-only fields before recreating an existing trigger. */
export function triggerForCreate(trigger: Trigger): Trigger {
  return {
    name: trigger.name,
    eventFilters: trigger.eventFilters,
    serviceAccount: trigger.serviceAccount,
    destination: trigger.destination,
    ...(trigger.channel ? { channel: trigger.channel } : {}),
    ...(trigger.labels ? { labels: trigger.labels } : {}),
    ...(trigger.eventDataContentType ? { eventDataContentType: trigger.eventDataContentType } : {}),
  };
}

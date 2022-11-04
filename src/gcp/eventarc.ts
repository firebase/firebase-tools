import { Client } from "../apiv2";
import { eventarcOrigin } from "../api";
import { cloneDeep } from "../utils";
import { last } from "lodash";
import { fieldMasks } from "./proto";

export const API_VERSION = "v1";

export interface Channel {
  /** User provided name. Must be projects/p/locations/l/channels/c */
  name: string;

  /** Server assigned uinique identifier. Format is a UUID4 */
  uid?: string;

  createTime?: string;
  updateTime?: string;

  /** If set, the channel will grant publish permissions to the 2P provider. */
  provider?: string;

  // BEGIN oneof transport
  pubsubTopic?: string;
  // END oneof transport

  state?: "PENDING" | "ACTIVE" | "INACTIVE";

  /** When the channel is PENDING, this token must be sent to the provider */
  activationToken?: string;

  cryptoKeyName?: string;
}

interface OperationMetadata {
  createTime: string;
  target: string;
  verb: string;
  requestedCancellation: boolean;
  apiVersion: string;
}

interface Operation {
  name: string;
  metadata: OperationMetadata;
  done: boolean;
}

const client = new Client({
  urlPrefix: eventarcOrigin,
  auth: true,
  apiVersion: API_VERSION,
});

/**
 * Gets a Channel.
 */
export async function getChannel(name: string): Promise<Channel | undefined> {
  const res = await client.get<Channel>(name);
  if (res.status === 404) {
    return undefined;
  }
  return res.body;
}

/**
 * Creates a channel.
 */
export async function createChannel(channel: Channel): Promise<Operation> {
  const body: Partial<Channel> = cloneDeep(channel);
  const pathParts = channel.name.split("/");

  const res = await client.post<Partial<Channel>, Operation>(
    pathParts.slice(0, -1).join("/"),
    body,
    {
      queryParams: { channelId: last(pathParts)! },
    }
  );
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
 * Deletes a chanel.
 */
export async function deleteChannel(name: string): Promise<void> {
  await client.delete(name);
}

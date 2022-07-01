/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { Client } from "../apiv2";
import { pubsubOrigin } from "../api";
import * as proto from "./proto";

const API_VERSION = "v1";

const client = new Client({
  urlPrefix: pubsubOrigin,
  auth: true,
  apiVersion: API_VERSION,
});

export type Encoding = "JSON" | "BINARY";

export interface MessageStoragePolicy {
  allowedPersistenceRegions: string[];
}

export interface SchemaSettings {
  schema: string;
  encoding: Encoding;
}

export interface Topic {
  name: string;
  labels?: Record<string, string>;
  messageStoragePolicy?: MessageStoragePolicy;
  kmsKeyName?: string;
  schemaSettings?: SchemaSettings;
  messageRetentionDuration?: proto.Duration;
}

export async function createTopic(topic: Topic): Promise<Topic> {
  const result = await client.put<Topic, Topic>(topic.name, topic);
  return result.body;
}

export async function getTopic(name: string): Promise<Topic> {
  const result = await client.get<Topic>(name);
  return result.body;
}

export async function updateTopic(topic: Topic): Promise<Topic> {
  const queryParams = {
    updateMask: proto.fieldMasks(topic).join(","),
  };
  const result = await client.patch<Topic, Topic>(topic.name, topic, { queryParams });
  return result.body;
}

export async function deleteTopic(name: string): Promise<void> {
  await client.delete(name);
}

// NOTE: We currently don't need or have specFromTopic.
// backend.ExistingBackend infers actual topics by the fact that it sees a function
// with a scheduled annotation. This may not be good enough when we're
// using Run, because we'll have to to query multiple resources (e.g. triggers)
// Were we to get a standalone Topic, we wouldn't have any idea how to set the
// "target service" since that is part of the subscription.

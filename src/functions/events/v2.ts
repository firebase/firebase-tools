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

export const PUBSUB_PUBLISH_EVENT = "google.cloud.pubsub.topic.v1.messagePublished" as const;

export const STORAGE_EVENTS = [
  "google.cloud.storage.object.v1.finalized",
  "google.cloud.storage.object.v1.archived",
  "google.cloud.storage.object.v1.deleted",
  "google.cloud.storage.object.v1.metadataUpdated",
] as const;

export const FIREBASE_ALERTS_PUBLISH_EVENT = "google.firebase.firebasealerts.alerts.v1.published";

export const DATABASE_EVENTS = [
  "google.firebase.database.ref.v1.written",
  "google.firebase.database.ref.v1.created",
  "google.firebase.database.ref.v1.updated",
  "google.firebase.database.ref.v1.deleted",
] as const;

export type Event =
  | typeof PUBSUB_PUBLISH_EVENT
  | typeof STORAGE_EVENTS[number]
  | typeof FIREBASE_ALERTS_PUBLISH_EVENT
  | typeof DATABASE_EVENTS[number];

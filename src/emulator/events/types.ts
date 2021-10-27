/**
 * The types in this file are stolen from the firebase-functions SDK. They are not subject
 * to change because they are TS interpretations of protobuf wire formats already used in
 * productiton services.
 *
 * We can't import some of them because they are marked "internal".
 */

import * as _ from "lodash";

import { Resource } from "firebase-functions";
import * as express from "express";

/**
 * Wire formal for v1beta1 EventFlow.
 * Used by Firestore and some other services.
 */
export interface LegacyEvent {
  data: any;
  eventType?: string;
  resource?: string;
  eventId?: string;
  timestamp?: string;
  params?: { [option: string]: any };
  auth?: AuthMode;
}

/**
 * Wire format for v1beta2 Eventflow (and likely v1).
 * Used by PubSub, RTDB, and some other services.
 */
export interface Event {
  context: {
    eventId: string;
    timestamp: string;
    eventType: string;
    resource: Resource;
  };
  data: any;
}

/**
 * A CloudEvent is a cross-platform format for encoding a serverless event.
 * More information can be found in https://github.com/cloudevents/spec
 */
export interface CloudEvent<T> {
  /** Version of the CloudEvents spec for this event. */
  specversion: string;

  /** A globally unique ID for this event. */
  id: string;

  /** The resource which published this event. */
  source: string;

  /** The resource, provided by source, that this event relates to */
  subject?: string;

  /** The type of event that this represents. */
  type: string;

  /** When this event occurred. */
  time: string;

  /** Information about this specific event. */
  data: T;

  /**
   * A map of template parameter name to value for subject strings.
   *
   * This map is only available on some event types that allow templates
   * in the subject string, such as Firestore. When listening to a document
   * template "/users/{uid}", an event with subject "/documents/users/1234"
   * would have a params of {"uid": "1234"}.
   *
   * Params are generated inside the firebase-functions SDK and are not
   * part of the CloudEvents spec nor the payload that a Cloud Function
   * actually receives.
   */
  params?: Record<string, string>;
}

export type CloudEventContext = Omit<CloudEvent<unknown>, "data" | "params">;

/**
 * Legacy AuthMode format.
 */
export interface AuthMode {
  admin: boolean;
  variable?: any;
}

/**
 * Utilities for operating on event types.
 */
export class EventUtils {
  static isEvent(proto: any): proto is Event {
    return _.has(proto, "context") && _.has(proto, "data");
  }

  static isLegacyEvent(proto: any): proto is LegacyEvent {
    return _.has(proto, "data") && _.has(proto, "resource");
  }

  static isBinaryCloudEvent(req: express.Request): boolean {
    return !!(
      req.header("ce-type") &&
      req.header("ce-specversion") &&
      req.header("ce-source") &&
      req.header("ce-id")
    );
  }

  static extractBinaryCloudEventContext(req: express.Request): CloudEventContext {
    const context: Partial<CloudEventContext> = {};
    for (const name of Object.keys(req.headers)) {
      if (name.startsWith("ce-")) {
        const attributeName = name.substr("ce-".length) as keyof CloudEventContext;
        context[attributeName] = req.header(name);
      }
    }
    return context as CloudEventContext;
  }
}

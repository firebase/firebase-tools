/**
 * The types in this file are stolen from the firebase-functions SDK. They are not subject
 * to change because they are TS interpretations of protobuf wire formats already used in
 * productiton services.
 *
 * We can't import some of them because they are marked "internal".
 */

import * as _ from "lodash";

import { Resource } from "firebase-functions";

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
 * Legacy AuthMode format.
 */
export interface AuthMode {
  admin: boolean;
  variable?: any;
}

/**
 * Utilities for determining event types.
 */
export class EventUtils {
  static isEvent(proto: any): proto is Event {
    return _.has(proto, "context") && _.has(proto, "data");
  }

  static isLegacyEvent(proto: any): proto is LegacyEvent {
    return _.has(proto, "data") && _.has(proto, "resource");
  }
}

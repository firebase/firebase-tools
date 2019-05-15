/**
 * The types in this file are stolen from the firebase-functions SDK. They are not subject
 * to change because they are TS interpretations of protobuf wire formats already used in
 * productiton services.
 */

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
 * Resource is a standard format for defining a resource (google.rpc.context.AttributeContext.Resource).
 * In Cloud Functions, it is the resource that triggered the function - such as a storage bucket.
 */
export interface Resource {
  service: string;
  name: string;
  type?: string;
  labels?: { [tag: string]: string };
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
    return EventUtils.hasFields(proto, ["context", "data"]);
  }

  static isLegacyEvent(proto: any): proto is LegacyEvent {
    return EventUtils.hasFields(proto, ["data", "resource"]);
  }

  static convertFromLegacy(event: LegacyEvent, service: string): Event {
    // TODO(samstern): Unclear what we should do with "params" and "authMode"
    return {
      context: {
        eventId: event.eventId || "",
        timestamp: event.timestamp || "",
        eventType: event.eventType || "",
        resource: {
          name: event.resource || "",
          service,
        },
      },
      data: event.data,
    };
  }

  static convertToLegacy(event: Event): LegacyEvent {
    return {
      eventId: event.context.eventId,
      timestamp: event.context.timestamp,
      eventType: event.context.eventType,
      resource: event.context.resource.name,
      data: event.data,
    };
  }

  private static hasFields(obj: any, fields: string[]): boolean {
    for (const field of fields) {
      if (obj[field] === undefined) {
        return false;
      }
    }

    return true;
  }
}

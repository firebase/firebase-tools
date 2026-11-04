import { randomUUID } from "crypto";

import { EventContext } from "firebase-functions";

import { Emulators } from "../types";
import { EmulatorLogger } from "../emulatorLogger";
import { EmulatorRegistry } from "../registry";
import { UserInfo, ProviderUserInfo } from "./state";
import { CloudEvent } from "../events/types";

type AuthCloudFunctionAction = "create" | "delete";

const AUTH_V2_ACTION_MAP: Record<AuthCloudFunctionAction, string> = {
  create: "created",
  delete: "deleted",
};

type CreateEvent = EventContext & {
  data: UserInfoPayload;
};

type AuthCloudEventData = { value: UserInfoPayloadV2 } | { oldValue: UserInfoPayloadV2 };

export class AuthCloudFunction {
  private logger = EmulatorLogger.forEmulator(Emulators.AUTH);
  private enabled = false;

  constructor(private projectId: string) {
    this.enabled = EmulatorRegistry.isRunning(Emulators.FUNCTIONS);
  }

  public async dispatch(action: AuthCloudFunctionAction, user: UserInfo): Promise<void> {
    if (!this.enabled) return;

    // 1. Prepare legacy 1st Gen Auth event payload (e.g. functions.auth.user().onCreate)
    const legacyEventBody = this.createEventRequestBody(action, user);

    // 2. Prepare modern 2nd Gen CloudEvent payload (e.g. onUserCreated / onUserDeleted)
    const v2CloudEventBody = this.createCloudEventRequestBody(action, user);

    const c = EmulatorRegistry.client(Emulators.FUNCTIONS);
    const errStatus: number[] = [];
    let err: Error | undefined;
    // Dispatch 1st Gen event to Functions Emulator
    try {
      const legacyRes = await c.post(
        `/functions/projects/${this.projectId}/trigger_multicast`,
        legacyEventBody,
      );
      if (legacyRes.status !== 200) {
        errStatus.push(legacyRes.status);
      }
    } catch (e: unknown) {
      err = e instanceof Error ? e : new Error(String(e));
    }

    // Dispatch 2nd Gen Eventarc CloudEvent to Functions Emulator
    try {
      const v2Res = await c.post(
        `/functions/projects/${this.projectId}/trigger_multicast`,
        v2CloudEventBody,
        {
          headers: { "Content-Type": "application/cloudevents+json; charset=UTF-8" },
        },
      );
      if (v2Res.status !== 200) {
        errStatus.push(v2Res.status);
      }
    } catch (e: unknown) {
      err = e instanceof Error ? e : new Error(String(e));
    }

    if (err || errStatus.length > 0) {
      this.logger.logLabeled(
        "WARN",
        "functions",
        `Firebase Authentication function was not triggered due to emulation error. Please file a bug.`,
      );
    }
  }

  private createEventRequestBody(action: AuthCloudFunctionAction, user: UserInfo): CreateEvent {
    return {
      eventId: randomUUID(),
      eventType: `providers/firebase.auth/eventTypes/user.${action}`,
      resource: {
        name: `projects/${this.projectId}`,
        service: "firebaseauth.googleapis.com",
      },
      params: {},
      timestamp: new Date().toISOString(),
      data: this.createUserInfoPayload(user),
    };
  }

  /**
   * Constructs an Eventarc CloudEvents v1.0 payload for 2nd Gen Auth triggers:
   * - type: "google.firebase.auth.user.v2.created" or "...deleted"
   * - data: protobuf envelope ({ value: user } on create, { oldValue: user } on delete)
   * - tenantid: top-level CloudEvent attribute used for tenant-scoped filtering
   */
  private createCloudEventRequestBody(
    action: AuthCloudFunctionAction,
    user: UserInfo,
  ): CloudEvent<AuthCloudEventData> & { tenantid?: string } {
    const ceAction = AUTH_V2_ACTION_MAP[action];
    const v2UserPayload = this.createV2UserInfoPayload(user);
    const cloudEvent: CloudEvent<AuthCloudEventData> & { tenantid?: string } = {
      specversion: "1.0",
      id: randomUUID(),
      time: new Date().toISOString(),
      type: `google.firebase.auth.user.v2.${ceAction}`,
      source: `//identitytoolkit.googleapis.com/projects/${this.projectId}`,
      subject: `users/${v2UserPayload.uid}`,
      data: action === "create" ? { value: v2UserPayload } : { oldValue: v2UserPayload },
    };
    if (user.tenantId) {
      cloudEvent.tenantid = user.tenantId;
    }
    return cloudEvent;
  }

  private toIsoTimestamp(epochMs?: string): string | undefined {
    if (!epochMs) return undefined;
    const ms = parseInt(epochMs, 10);
    if (isNaN(ms)) return undefined;
    const date = new Date(ms);
    return isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  private createBaseUserInfoPayload(user: UserInfo): BaseUserInfoPayload {
    return {
      uid: user.localId,
      email: user.email,
      emailVerified: user.emailVerified,
      displayName: user.displayName,
      photoURL: user.photoUrl,
      phoneNumber: user.phoneNumber,
      disabled: user.disabled,
      customClaims: JSON.parse(user.customAttributes || "{}") as Record<string, unknown>,
    };
  }

  private createV2UserInfoPayload(user: UserInfo): UserInfoPayloadV2 {
    return {
      ...this.createBaseUserInfoPayload(user),
      metadata: {
        createTime: this.toIsoTimestamp(user.createdAt),
        lastSignInTime: this.toIsoTimestamp(user.lastLoginAt),
      },
      providerData: user.providerUserInfo?.map((info) =>
        this.createV2ProviderUserInfoPayload(info),
      ),
    };
  }

  private createV2ProviderUserInfoPayload(info: ProviderUserInfo): ProviderUserInfoPayloadV2 {
    return {
      uid: info.rawId,
      providerId: info.providerId,
      displayName: info.displayName,
      email: info.email,
      photoURL: info.photoUrl,
    };
  }

  private createUserInfoPayload(user: UserInfo): UserInfoPayload {
    return {
      ...this.createBaseUserInfoPayload(user),
      metadata: {
        creationTime: this.toIsoTimestamp(user.createdAt),
        lastSignInTime: this.toIsoTimestamp(user.lastLoginAt),
      },
      providerData: user.providerUserInfo?.map((info) => this.createProviderUserInfoPayload(info)),
      tenantId: user.tenantId,
      mfaInfo: user.mfaInfo,
    };
  }

  private createProviderUserInfoPayload(info: ProviderUserInfo): ProviderUserInfoPayload {
    return {
      rawId: info.rawId,
      providerId: info.providerId,
      displayName: info.displayName,
      email: info.email,
      federatedId: info.federatedId,
      phoneNumber: info.phoneNumber,
      photoURL: info.photoUrl,
      screenName: info.screenName,
    };
  }
}

type BaseUserInfoPayload = {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  photoURL?: string;
  disabled?: boolean;
  phoneNumber?: string;
  customClaims?: Record<string, unknown>;
};

// Matches google.events.firebase.auth.v2.User (google-cloudevents data.proto).
interface UserInfoPayloadV2 extends BaseUserInfoPayload {
  metadata: {
    createTime?: string;
    lastSignInTime?: string;
  };
  providerData?: ProviderUserInfoPayloadV2[];
}

interface ProviderUserInfoPayloadV2 {
  uid: string;
  displayName?: string;
  email?: string;
  photoURL?: string;
  providerId: string;
}

// This should have the same fields as go/firebase-auth-event-payload and ONLY
// those fields, in that order. These fields are a subset of UserRecord in Admin
// SDKs and notably, passwordHash / passwordSalt / validSince is NOT exposed.
type UserInfoPayload = BaseUserInfoPayload & {
  metadata: {
    creationTime?: string;
    lastSignInTime?: string;
  };
  providerData?: ProviderUserInfoPayload[];
  tenantId?: string;
  mfaInfo?: object;
};

type ProviderUserInfoPayload = {
  displayName?: string;
  email?: string;
  federatedId?: string;
  phoneNumber?: string;
  photoURL?: string;
  providerId: string;
  rawId: string;
  screenName?: string;
};

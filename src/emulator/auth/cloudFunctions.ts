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

type AuthCloudEventData = { value: UserInfoPayload } | { oldValue: UserInfoPayload };

export class AuthCloudFunction {
  private logger = EmulatorLogger.forEmulator(Emulators.AUTH);
  private enabled = false;

  constructor(private projectId: string) {
    this.enabled = EmulatorRegistry.isRunning(Emulators.FUNCTIONS);
  }

  public async dispatch(action: AuthCloudFunctionAction, user: UserInfo): Promise<void> {
    if (!this.enabled) return;

    const userInfoPayload = this.createUserInfoPayload(user);

    // 1. Prepare legacy 1st Gen Auth event payload (e.g. functions.auth.user().onCreate)
    const legacyEventBody = this.createEventRequestBody(action, userInfoPayload);

    // 2. Prepare modern 2nd Gen CloudEvent payload (e.g. onUserCreated / onUserDeleted)
    const v2CloudEventBody = this.createCloudEventRequestBody(action, userInfoPayload);

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

  private createEventRequestBody(
    action: AuthCloudFunctionAction,
    userInfoPayload: UserInfoPayload,
  ): CreateEvent {
    return {
      eventId: randomUUID(),
      eventType: `providers/firebase.auth/eventTypes/user.${action}`,
      resource: {
        name: `projects/${this.projectId}`,
        service: "firebaseauth.googleapis.com",
      },
      params: {},
      timestamp: new Date().toISOString(),
      data: userInfoPayload,
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
    userInfoPayload: UserInfoPayload,
  ): CloudEvent<AuthCloudEventData> & { tenantid?: string } {
    const ceAction = AUTH_V2_ACTION_MAP[action];
    const cloudEvent: CloudEvent<AuthCloudEventData> & { tenantid?: string } = {
      specversion: "1.0",
      id: randomUUID(),
      time: new Date().toISOString(),
      type: `google.firebase.auth.user.v2.${ceAction}`,
      source: `//identitytoolkit.googleapis.com/projects/${this.projectId}`,
      subject: `users/${userInfoPayload.uid}`,
      data: action === "create" ? { value: userInfoPayload } : { oldValue: userInfoPayload },
    };
    if (userInfoPayload.tenantId) {
      cloudEvent.tenantid = userInfoPayload.tenantId;
    }
    return cloudEvent;
  }

  private createUserInfoPayload(user: UserInfo): UserInfoPayload {
    return {
      uid: user.localId,
      email: user.email,
      emailVerified: user.emailVerified,
      displayName: user.displayName,
      photoURL: user.photoUrl,
      phoneNumber: user.phoneNumber,
      disabled: user.disabled,
      metadata: {
        creationTime: user.createdAt
          ? new Date(parseInt(user.createdAt, 10)).toISOString()
          : undefined,
        lastSignInTime: user.lastLoginAt
          ? new Date(parseInt(user.lastLoginAt, 10)).toISOString()
          : undefined,
      },
      customClaims: JSON.parse(user.customAttributes || "{}"),
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

// This should have the same fields as go/firebase-auth-event-payload and ONLY
// those fields, in that order. These fields are a subset of UserRecord in Admin
// SDKs and notably, passwordHash / passwordSalt / validSince is NOT exposed.
type UserInfoPayload = {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  photoURL?: string;
  disabled?: boolean;
  metadata: {
    creationTime?: string;
    lastSignInTime?: string;
  };
  providerData?: ProviderUserInfoPayload[];
  phoneNumber?: string;
  customClaims?: object;
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

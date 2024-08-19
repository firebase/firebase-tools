import * as uuid from "uuid";

import { EventContext } from "firebase-functions";

import { Emulators } from "../types";
import { EmulatorLogger } from "../emulatorLogger";
import { EmulatorRegistry } from "../registry";
import { UserInfo } from "./state";

type AuthCloudFunctionAction = "create" | "delete";

type CreateEvent = EventContext & {
  data: UserInfoPayload;
};

export class AuthCloudFunction {
  private logger = EmulatorLogger.forEmulator(Emulators.AUTH);
  private enabled = false;

  constructor(private projectId: string) {
    this.enabled = EmulatorRegistry.isRunning(Emulators.FUNCTIONS);
  }

  public async dispatch(action: AuthCloudFunctionAction, user: UserInfo): Promise<void> {
    if (!this.enabled) return;

    const userInfoPayload = this.createUserInfoPayload(user);
    const multicastEventBody = this.createEventRequestBody(action, userInfoPayload);

    const c = EmulatorRegistry.client(Emulators.FUNCTIONS);
    let res;
    let err: Error | undefined;
    try {
      res = await c.post(
        `/functions/projects/${this.projectId}/trigger_multicast`,
        multicastEventBody,
      );
    } catch (e: any) {
      err = e;
    }

    if (err || res?.status !== 200) {
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
      eventId: uuid.v4(),
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
      providerData: user.providerUserInfo,
      tenantId: user.tenantId,
      mfaInfo: user.mfaInfo,
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
  providerData?: object[];
  phoneNumber?: string;
  customClaims?: object;
  tenantId?: string;
  mfaInfo?: object;
};

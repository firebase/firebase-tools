import { Client } from "../../apiv2";

import { EmulatorInfo, Emulators } from "../types";
import { EmulatorLogger } from "../emulatorLogger";
import { EmulatorRegistry } from "../registry";
import { UserInfo } from "./state";

type AuthCloudFunctionAction = "create" | "delete";

export class AuthCloudFunction {
  private logger = EmulatorLogger.forEmulator(Emulators.AUTH);
  private functionsEmulatorInfo?: EmulatorInfo;
  private multicastOrigin = "";
  private multicastPath = "";
  private enabled = false;

  constructor(private projectId: string) {
    const functionsEmulator = EmulatorRegistry.get(Emulators.FUNCTIONS);

    if (functionsEmulator) {
      this.enabled = true;
      this.functionsEmulatorInfo = functionsEmulator.getInfo();
      this.multicastOrigin = `http://${EmulatorRegistry.getInfoHostString(
        this.functionsEmulatorInfo
      )}`;
      this.multicastPath = `/functions/projects/${projectId}/trigger_multicast`;
    }
  }

  public async dispatch(action: AuthCloudFunctionAction, user: UserInfo): Promise<void> {
    if (!this.enabled) return;

    const userInfoPayload = this.createUserInfoPayload(user);
    const multicastEventBody = this.createEventRequestBody(action, userInfoPayload);

    const c = new Client({ urlPrefix: this.multicastOrigin, auth: false });
    let res;
    let err: Error | undefined;
    try {
      res = await c.post(this.multicastPath, multicastEventBody);
    } catch (e) {
      err = e;
    }

    if (err || res?.status != 200) {
      this.logger.logLabeled(
        "WARN",
        "functions",
        `Firebase Authentication function was not triggered due to emulation error. Please file a bug.`
      );
    }
  }

  private createEventRequestBody(
    action: AuthCloudFunctionAction,
    userInfoPayload: UserInfoPayload
  ): { eventType: string; data: UserInfoPayload } {
    return {
      eventType: `providers/firebase.auth/eventTypes/user.${action}`,
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
        creationTime: user.createdAt,
        lastSignInTime: user.lastLoginAt,
      },
      customClaims: JSON.parse(user.customAttributes || "{}"),
      providerData: user.providerUserInfo,
      tenantId: user.tenantId,
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
};

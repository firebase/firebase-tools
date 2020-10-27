import { EmulatorRegistry } from "../registry";
import { EmulatorInfo, Emulators } from "../types";
import { UserInfo } from "./state";
import * as request from "request";
import { EmulatorLogger } from "../emulatorLogger";

type AuthCloudFunctionAction = "create" | "delete";

export class AuthCloudFunction {
  private logger = EmulatorLogger.forEmulator(Emulators.AUTH);
  private functionsEmulatorInfo?: EmulatorInfo;
  private multicastEndpoint = "";
  private enabled = false;

  constructor(private projectId: string) {
    const functionsEmulator = EmulatorRegistry.get(Emulators.FUNCTIONS);

    if (functionsEmulator) {
      this.enabled = true;
      this.functionsEmulatorInfo = functionsEmulator.getInfo();
      this.multicastEndpoint = `http://${this.functionsEmulatorInfo?.host}:${this.functionsEmulatorInfo?.port}/functions/projects/${projectId}/trigger_multicast`;
    }
  }

  public dispatch(action: AuthCloudFunctionAction, user: UserInfo): void {
    if (!this.enabled) return;

    const userInfoPayload = this.createUserInfoPayload(user);
    const multicastEventBody = this.createEventRequestBody(action, userInfoPayload);

    request.post(this.multicastEndpoint, {
      body: multicastEventBody,
      callback: (error, response) => {
        if (error || response.statusCode != 200) {
          this.logger.logLabeled(
            "WARN",
            "functions",
            `Firebase Authentication function was not triggered due to emulation error. Please file a bug.`
          );
        }
      },
    });
  }

  private createEventRequestBody(
    action: AuthCloudFunctionAction,
    userInfoPayload: UserInfoPayload
  ): string {
    return JSON.stringify({
      eventType: `providers/firebase.auth/eventTypes/user.${action}`,
      data: userInfoPayload,
    });
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

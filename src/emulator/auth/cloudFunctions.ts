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
      email: user.email,
      emailVerified: user.emailVerified,
      displayName: user.displayName,
      photoURL: user.photoUrl,
      phoneNumber: user.phoneNumber,
      disabled: user.disabled,
      passwordHash: user.passwordHash,
      tokensValidAfterTime: user.validSince,
      metadata: {
        creationTime: user.createdAt,
        lastSignInTime: user.lastLoginAt,
      },
      customClaims: JSON.parse(user.customAttributes || "{}"),
      providerData: user.providerUserInfo,
    };
  }
}

type UserInfoPayload = {
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  photoURL?: string;
  phoneNumber?: string;
  disabled?: boolean;
  passwordHash?: string;
  passwordSalt?: string;
  tokensValidAfterTime?: string;
  metadata: {
    creationTime?: string;
    lastSignInTime?: string;
  };
  customClaims?: object;
  providerData?: object[];
};

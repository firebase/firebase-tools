import type { Options } from "../options";

export type SetupMonospaceOptions = Pick<Options, "config" | "project" | "isVSCE">;

export type GetInitFirebaseResponse =
  | {
      success: true;
      userResponse: {
        success: true;
        projectId: string;
      };
    }
  | { success: false; error: "WAITING_FOR_RESPONSE" | "USER_CANCELED" | unknown }; // TODO: define all errors

export type InitFirebaseResponse =
  | {
      success: true;
      rid: string;
    }
  | { success: false; error: "NOT_INITIALIZED" | unknown }; // TODO: define all errors

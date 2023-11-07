import type { Options } from "../options";

export type SetupMonospaceOptions = {
  projectRoot: Options["projectRoot"];
  project: Options["project"];
  isVSCE: Options["isVSCE"];
};

export type GetInitFirebaseResponse =
  | {
      success: true;
      userResponse: {
        success: true;
        projectId: string;
      };
    }
  | {
      success: true;
      userResponse: {
        success: false;
      };
    }
  | {
      success: false;
      error: "WAITING_FOR_RESPONSE" | "USER_CANCELED" | string; // TODO: define all errors
    };

export type InitFirebaseResponse =
  | {
      success: true;
      rid: string;
    }
  | { success: false; error: "NOT_INITIALIZED" | unknown }; // TODO: define all errors

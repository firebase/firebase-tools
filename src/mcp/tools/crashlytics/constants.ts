import { z } from "zod";

export const APP_ID_FIELD = z
  .string()
  .describe(
    "AppId for the application. For an Android application, read the " +
      "mobilesdk_app_id value specified in the google-services.json file for " +
      "the current package name. For an iOS Application, read the GOOGLE_APP_ID " +
      "from GoogleService-Info.plist. If neither is available, ask the user to " +
      "provide the app id.",
  );

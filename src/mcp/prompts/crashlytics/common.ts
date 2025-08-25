export const ACTIVE_USER_INSTRUCTION =
  "If the Firbase 'Active user' is set to <NONE>, instruct the user to run `firebase login` before continuing. You will know that the user is not logged in if we have nothing in the 'Active user' field.";

export const getAppIdInstruction: (index: number) => string = (
  index: number,
) => `If there is no active app id, then do the following:
  ${index}a. If this is an Android app, read the mobilesdk_app_id value specified in the google-services.json file. If there are multiple files or multiple app ids in single file. Ask the user to disambiguate.
  ${index}b. If this is an iOS app, read the GOOGLE_APP_ID from GoogleService-Info.plist file. If there are multiple files or multiple app ids in single file. Ask the user to disambiguate.
  ${index}c. If you can't find either of the above, ask the user for the app id.
`;

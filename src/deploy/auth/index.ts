export { prepare } from "./prepare";
export { deploy } from "./deploy";
export { release } from "./release";

export const help =
  "Deploys blocking functions and configuration settings for Firebase Authentication.";
export const detailedHelp =
  "Firebase Authentication configures identity providers and sign-in methods.\n\n" +
  "Configuration format in firebase.json:\n" +
  "{\n" +
  '  "auth": {\n' +
  '    "providers": {\n' +
  '      "anonymous": true,\n' +
  '      "emailPassword": true,\n' +
  '      "googleSignIn": {\n' +
  '        "authorizedRedirectUris": [\n' +
  '          "https://my-app.firebaseapp.com/__/auth/handler"\n' +
  "        ],\n" +
  '        "supportEmail": "support@example.com"\n' +
  "      }\n" +
  "    }\n" +
  "  }\n" +
  "}";

export { prepare } from "./prepare";
export { deploy } from "./deploy";
export { release } from "./release";

export const help =
  "Deploys blocking functions and configuration settings for Firebase Authentication.";
export const detailedHelp =
  "Authentication configures blocking Cloud Functions and Auth configuration.\n\n" +
  "Configuration format in firebase.json:\n" +
  "{\n" +
  '  "auth": {\n' +
  '    "blockingFunctions": {\n' +
  '      "beforeCreate": "beforeCreateFunction"\n' +
  "    }\n" +
  "  }\n" +
  "}";

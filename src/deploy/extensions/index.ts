export { prepare } from "./prepare";
export { deploy } from "./deploy";
export { release } from "./release";

export const help = "Deploys configuration changes to your installed Extension instances.";
export const detailedHelp =
  "Extensions deploys configuration changes to installed Extension instances.\n\n" +
  "Extension configuration is not declared in firebase.json. Instead, it is configured in the extensions/ folder.\n" +
  "Deploy details are synced automatically when running `firebase deploy --only extensions`.";

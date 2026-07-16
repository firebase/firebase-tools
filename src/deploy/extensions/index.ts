export { prepare } from "./prepare";
export { deploy } from "./deploy";
export { release } from "./release";

export const help = "Deploys configuration changes to your installed Extension instances.";
export const detailedHelp =
  "Firebase Extensions deploys settings and configuration environments for installed extension instances.\n\n" +
  "Configuration format in firebase.json:\n" +
  "{\n" +
  '  "extensions": {\n' +
  '    "my-extension-instance-id": "firebase/storage-resize-images@^0.1.0"\n' +
  "  }\n" +
  "}";

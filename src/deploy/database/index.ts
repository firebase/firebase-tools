export { prepare } from "./prepare";
export { deploy } from "./deploy";
export { release } from "./release";

export const help = "Deploys security rules and indexes defined in your project's firebase.json.";
export const detailedHelp =
  "Realtime Database deploys rules to your default or custom database instances.\n\n" +
  "Configuration format in firebase.json:\n" +
  "{\n" +
  '  "database": {\n' +
  '    "rules": "database.rules.json"\n' +
  "  }\n" +
  "}\n\n" +
  "For multiple database instances configuration, use an array of objects:\n" +
  "{\n" +
  '  "database": [\n' +
  '    { "instance": "my-db-1", "rules": "rules.json" },\n' +
  '    { "instance": "my-db-2", "rules": "rules.json" }\n' +
  "  ]\n" +
  "}";

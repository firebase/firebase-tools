export { prepare } from "./prepare";
export { deploy } from "./deploy";
export { release } from "./release";

export const help = "Deploys security rules defined in your project's firebase.json.";
export const detailedHelp =
  "Realtime Database deploys rules to database instances.\n\n" +
  "Single database configuration in firebase.json:\n" +
  "{\n" +
  '  "database": {\n' +
  '    "rules": "database.rules"\n' +
  "  }\n" +
  "}\n\n" +
  "Multiple database instances configuration (by target or database ID):\n" +
  "{\n" +
  '  "database": [\n' +
  '    { "target": "my-db-target", "rules": "rules.rules" },\n' +
  '    { "database": "my-database-id", "rules": "rules.rules" }\n' +
  "  ]\n" +
  "}";

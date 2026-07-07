export { prepare } from "./prepare";
export { deploy } from "./deploy";
export { release } from "./release";

export const help = "Deploys security rules and indexes defined in your project's firebase.json.";
export const detailedHelp =
  "Realtime Database deploys rules and indexes to database instances.\n\n" +
  "Single database configuration in firebase.json:\n" +
  "{\n" +
  '  "database": {\n' +
  '    "rules": "database.rules.json"\n' +
  "  }\n" +
  "}\n\n" +
  "Multiple database instances configuration (by target or database ID):\n" +
  "{\n" +
  '  "database": [\n' +
  '    { "target": "my-db-target", "rules": "rules.json" },\n' +
  '    { "database": "my-database-id", "rules": "rules.json", "indexes": "database.indexes.json" }\n' +
  "  ]\n" +
  "}";

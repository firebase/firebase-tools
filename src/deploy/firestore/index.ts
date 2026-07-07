import prepare from "./prepare";
import deploy from "./deploy";
import release from "./release";

export { prepare, deploy, release };

export const help = "Deploys security rules and indexes defined in your project's firebase.json.";
export const detailedHelp =
  "Cloud Firestore deploys security rules and indexes to Firestore databases.\n\n" +
  "Single database configuration in firebase.json:\n" +
  "{\n" +
  '  "firestore": {\n' +
  '    "rules": "firestore.rules",\n' +
  '    "indexes": "firestore.indexes.json"\n' +
  "  }\n" +
  "}\n\n" +
  "Multiple databases configuration (by target or database ID):\n" +
  "{\n" +
  '  "firestore": [\n' +
  '    { "target": "my-firestore-target", "rules": "firestore.rules", "indexes": "indexes.json" },\n' +
  '    { "database": "another-db", "rules": "another.rules", "indexes": "another.indexes.json" }\n' +
  "  ]\n" +
  "}";

import prepare from "./prepare";
import deploy from "./deploy";
import release from "./release";

export { prepare, deploy, release };

export const help = "Deploys security rules and indexes defined in your project's firebase.json.";
export const detailedHelp =
  "Cloud Firestore deploys security rules and indexes to Firestore databases.\n\n" +
  "Configuration format in firebase.json:\n" +
  "{\n" +
  '  "firestore": {\n' +
  '    "rules": "firestore.rules",\n' +
  '    "indexes": "firestore.indexes.json"\n' +
  "  }\n" +
  "}\n\n" +
  "For multiple databases configuration, use an array of objects:\n" +
  "{\n" +
  '  "firestore": [\n' +
  '    { "database": "(default)", "rules": "firestore.rules", "indexes": "indexes.json" }\n' +
  "  ]\n" +
  "}";

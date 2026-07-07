import prepare from "./prepare";
import deploy from "./deploy";
import release from "./release";

export { prepare, deploy, release };

export const help =
  "Deploys security rules for Cloud Storage buckets defined in your project's firebase.json.";
export const detailedHelp =
  "Cloud Storage deploys security rules to Storage buckets.\n\n" +
  "Configuration format in firebase.json:\n" +
  "{\n" +
  '  "storage": {\n' +
  '    "rules": "storage.rules"\n' +
  "  }\n" +
  "}\n\n" +
  "For multiple buckets configuration, use an array of objects:\n" +
  "{\n" +
  '  "storage": [\n' +
  '    { "bucket": "my-app.appspot.com", "rules": "storage.rules" }\n' +
  "  ]\n" +
  "}";

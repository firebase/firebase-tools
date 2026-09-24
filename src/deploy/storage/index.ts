import prepare from "./prepare";
import deploy from "./deploy";
import release from "./release";

export { prepare, deploy, release };

export const help =
  "Deploys security rules for Cloud Storage buckets defined in your project's firebase.json.";
export const detailedHelp =
  "Cloud Storage deploys security rules to Storage buckets.\n\n" +
  "Single bucket configuration in firebase.json:\n" +
  "{\n" +
  '  "storage": {\n' +
  '    "rules": "storage.rules"\n' +
  "  }\n" +
  "}\n\n" +
  "Multiple buckets configuration (requires bucket name and rules file):\n" +
  "{\n" +
  '  "storage": [\n' +
  '    { "bucket": "my-app-bucket-1", "rules": "storage-1.rules" },\n' +
  '    { "bucket": "my-app-bucket-2", "rules": "storage-2.rules", "target": "my-storage-target" }\n' +
  "  ]\n" +
  "}";

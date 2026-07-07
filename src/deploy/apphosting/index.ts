import prepare from "./prepare";
import deploy from "./deploy";
import release from "./release";

export { prepare, deploy, release };

export const help =
  "Deploys Next.js / Angular / Astro app backends. Supports configuration in apphosting.yaml.";
export const detailedHelp =
  "App Hosting deploys Frameworks-based web application backends.\n\n" +
  "Single backend configuration in firebase.json:\n" +
  "{\n" +
  '  "apphosting": {\n' +
  '    "backendId": "my-backend-id",\n' +
  '    "rootDir": ".",\n' +
  '    "ignore": ["node_modules", ".git"]\n' +
  "  }\n" +
  "}\n\n" +
  "Multiple backends configuration:\n" +
  "{\n" +
  '  "apphosting": [\n' +
  "    {\n" +
  '      "backendId": "my-backend-1",\n' +
  '      "rootDir": "apps/backend-1",\n' +
  '      "ignore": ["node_modules"]\n' +
  "    },\n" +
  "    {\n" +
  '      "backendId": "my-backend-2",\n' +
  '      "rootDir": "apps/backend-2",\n' +
  '      "ignore": ["node_modules"]\n' +
  "    }\n" +
  "  ]\n" +
  "}";

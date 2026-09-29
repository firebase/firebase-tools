import { prepare } from "./prepare";
import { deploy } from "./deploy";
import { release } from "./release";

export { prepare, deploy, release };

export const help = "Builds and deploys web apps to Cloud Run services listed in firebase.json.";
export const detailedHelp =
  "Deploys Cloud Run services from local source, or from a local build if localBuild is set.\n\n" +
  "Configuration in firebase.json:\n" +
  "{\n" +
  '  "run": {\n' +
  '    "serviceId": "my-service",\n' +
  '    "region": "us-central1",\n' +
  '    "rootDir": "/",\n' +
  '    "ignore": ["node_modules", ".git"]\n' +
  "  }\n" +
  "}\n\n" +
  "Base images are configured on the service with firebase run:baseImage:set and are reused on every deploy.";

import { prepare } from "./prepare";
import { deploy } from "./deploy";
import { release } from "./release";

export { prepare, deploy, release };

export const help =
  "Builds and deploys web apps to Cloud Run services listed in firebase.json. Supports filtering:\n" +
  "  --only run:serviceId (in every region firebase.json lists it in)\n" +
  "  --only run:serviceId:region (in one region)";
export const detailedHelp =
  "Deploys Cloud Run services from local source.\n\n" +
  "Configuration in firebase.json:\n" +
  "{\n" +
  '  "run": {\n' +
  '    "serviceId": "my-service",\n' +
  '    "region": "us-central1",\n' +
  '    "rootDir": "/",\n' +
  '    "ignore": ["node_modules", ".git"]\n' +
  "  }\n" +
  "}\n\n" +
  "Base images are configured on the service with firebase run:services:update --base-image and are reused on every deploy.";

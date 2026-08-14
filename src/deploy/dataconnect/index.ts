import prepare from "./prepare";
import deploy from "./deploy";
import release from "./release";

export { prepare, deploy, release };

export const help =
  "Deploys Data Connect services, schemas, and connectors. Supports filtering:\n" +
  "  --only dataconnect:serviceId\n" +
  "  --only dataconnect:serviceId:connectorId\n" +
  "  --only dataconnect:serviceId:schema";
export const detailedHelp =
  "Firebase Data Connect deploys services, GraphQL schemas, and connectors.\n\n" +
  "Single service configuration in firebase.json:\n" +
  "{\n" +
  '  "dataconnect": {\n' +
  '    "source": "dataconnect"\n' +
  "  }\n" +
  "}\n\n" +
  "Multiple services configuration:\n" +
  "{\n" +
  '  "dataconnect": [\n' +
  '    { "source": "dataconnect-service-1" },\n' +
  '    { "source": "dataconnect-service-2" }\n' +
  "  ]\n" +
  "}";

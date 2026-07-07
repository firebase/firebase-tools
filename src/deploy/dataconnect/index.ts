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
  "Data Connect deploys services, GraphQL schemas, and connectors.\n\n" +
  "Configuration format in firebase.json:\n" +
  "{\n" +
  '  "dataconnect": {\n' +
  '    "source": "dataconnect"\n' +
  "  }\n" +
  "}";

export { prepare } from "./prepare";
export { deploy } from "./deploy";
export { release } from "./release";

export const help =
  "Deploys functions from the functions directory. Supports filtering function deploys:\n" +
  "  --only functions:func1,functions:func2 (scoped function deploy)\n" +
  "  --only functions:group.subgroup (scoped by export group)\n" +
  "  --only functions:codebase:func (scoped by codebase and function)";
export const detailedHelp =
  "Cloud Functions for Firebase deploys functions source code from the functions directory.\n\n" +
  "Configuration format in firebase.json:\n" +
  "{\n" +
  '  "functions": {\n' +
  '    "source": "functions",\n' +
  '    "codebase": "default",\n' +
  '    "runtime": "nodejs20",\n' +
  '    "predeploy": [\n' +
  '      "npm --prefix \\"$RESOURCE_DIR\\" run lint",\n' +
  '      "npm --prefix \\"$RESOURCE_DIR\\" run build"\n' +
  "    ]\n" +
  "  }\n" +
  "}";

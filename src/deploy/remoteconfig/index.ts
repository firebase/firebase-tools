import prepare from "./prepare";
import release from "./release";
import deploy from "./deploy";

export { prepare, release, deploy };

export const help = "Deploys templates defined in your project's firebase.json.";
export const detailedHelp =
  "Remote Config deploys templates defining parameters and conditions.\n\n" +
  "Configuration format in firebase.json:\n" +
  "{\n" +
  '  "remoteconfig": {\n' +
  '    "template": "remoteconfig.template.json"\n' +
  "  }\n" +
  "}";

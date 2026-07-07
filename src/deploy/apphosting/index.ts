import prepare from "./prepare";
import deploy from "./deploy";
import release from "./release";

export { prepare, deploy, release };

export const help =
  "Deploys Next.js / Angular / Astro app backends. Supports configuration in apphosting.yaml.";
export const detailedHelp =
  "App Hosting deploys frameworks application backends.\n\n" +
  "Configuration format in firebase.json:\n" +
  "{\n" +
  '  "apphosting": {\n' +
  '    "source": "."\n' +
  "  }\n" +
  "}\n\n" +
  "App settings and environment variables can also be customized inside apphosting.yaml.";

import { NEXT_JS } from "./frameworks";

/**
 * Discovers the web framework of the project.
 */
export async function discoverFramework(): Promise<any> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const data = {
        framework: NEXT_JS,
        buildCommand: "npm run build",
        installCommand: "npm install",
        rootDirectory: "/",
        outputDirectory: "public",
      };
      resolve(data);
    }, 3000);
  });
}

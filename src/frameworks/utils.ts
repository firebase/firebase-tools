import { readFile } from "fs/promises";
import { join } from "path";

/**
 * Prints a warning if the build script in package.json
 * contains anything other than allowedBuildScripts.
 */
export async function warnIfCustomBuildScript(
  dir: string,
  defaultBuildScripts: string[]
): Promise<void> {
  const packageJsonBuffer = await readFile(join(dir, "package.json"));
  const packageJson = JSON.parse(packageJsonBuffer.toString());
  const buildScript = packageJson.scripts?.build;

  if (buildScript && !defaultBuildScripts.includes(buildScript)) {
    console.warn(
      `WARNING: Your package.json contains a custom build script "${buildScript}" that will be ignored. Only the default build scripts "${defaultBuildScripts.join(
        " OR "
      )}" are supported. Please, refer to the docs in order to use a custom build script: https://firebase.google.com/docs/hosting/express\n`
    );
  }
}

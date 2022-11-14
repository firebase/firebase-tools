import { readFile } from "fs/promises";
import { join } from "path";

/**
 * Returns whether the build script in package.json
 * contains anything other than "next build".
 */
export async function isUsingCustomBuildScript(
  dir: string,
  buildCommand: string
): Promise<boolean> {
  const packageJsonBuffer = await readFile(join(dir, "package.json"));
  const packageJson = JSON.parse(packageJsonBuffer.toString());
  const buildScript = packageJson.scripts?.build;
  return buildScript && buildScript !== buildCommand;
}

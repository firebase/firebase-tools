import { PackageManagerDependency } from "../../interfaces";
import * as path from "path";
import { readFileSync } from "fs";

/**
 *
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function discoverNpmPackageManager(
  target: PackageManagerDependency,
  directory: string
): Promise<boolean> {
  const dependency = target.dependency;
  // Check package.json JSON
  try {
    const packagePath = path.join(directory, "package.json");
    const packageFile = readFileSync(packagePath, { encoding: "utf8" });
    const packageJson = JSON.parse(packageFile);

    if (packageJson?.dependencies?.[dependency]) {
      return true;
    }
  } catch (e) {
    // package.json doesn't exist, or is malformed
  }

  // maybe check package.lock JSON

  // ... maybe, execute "npm ls" and check there.
  // (less a fan when it comes to other frameworks)
  return false;
}

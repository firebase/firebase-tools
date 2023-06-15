import { PackageJson, WorkspacePackageRegistry } from "./findWorkspacePackages";
import { readTypedJson } from "./utils";

export function adaptPackageJson(packageJsonPath: string, registry: WorkspacePackageRegistry) {
  const packageJson = readTypedJson<PackageJson>(packageJsonPath);
}

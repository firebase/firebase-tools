import * as path from "path";
import * as fs from "fs-extra";
import { PackageManifest, WorkspaceRegistry } from "./types";

function isWorkspaceProtocol(version: string): boolean {
  return version.startsWith("workspace:");
}

function getRelativePath(from: string, to: string): string {
  const relativePath = path.relative(from, to);
  if (!relativePath.startsWith(".")) {
    return `./${relativePath}`;
  }
  return relativePath;
}

export function rewriteWorkspaceDependencies(
  manifest: PackageManifest,
  registry: WorkspaceRegistry,
  internalDeps: Set<string>,
  manifestDir: string,
  workspacesDir: string
): PackageManifest {
  const rewritten = { ...manifest };

  const rewriteDeps = (deps: Record<string, string> | undefined): Record<string, string> | undefined => {
    if (!deps) {
      return deps;
    }

    const result: Record<string, string> = {};
    for (const [depName, depVersion] of Object.entries(deps)) {
      if (isWorkspaceProtocol(depVersion) && registry.has(depName)) {
        const safeName = depName.replace(/^@/, "").replace(/\//g, "-");
        const depDir = path.join(workspacesDir, safeName);
        const relativePath = getRelativePath(manifestDir, depDir);
        result[depName] = `file:${relativePath}`;
      } else if (internalDeps.has(depName) && registry.has(depName)) {
        const safeName = depName.replace(/^@/, "").replace(/\//g, "-");
        const depDir = path.join(workspacesDir, safeName);
        const relativePath = getRelativePath(manifestDir, depDir);
        result[depName] = `file:${relativePath}`;
      } else {
        result[depName] = depVersion;
      }
    }
    return result;
  };

  if (rewritten.dependencies) {
    rewritten.dependencies = rewriteDeps(rewritten.dependencies);
  }

  if (rewritten.devDependencies) {
    rewritten.devDependencies = rewriteDeps(rewritten.devDependencies);
  }

  return rewritten;
}

export function writeAdaptedManifest(manifest: PackageManifest, outputPath: string): void {
  fs.writeJsonSync(outputPath, manifest, { spaces: 2 });
}

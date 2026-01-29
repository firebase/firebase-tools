import * as path from "path";
import * as fs from "fs-extra";
import * as yaml from "yaml";
import { sync as globSync } from "glob";
import { FirebaseError } from "../../../error";
import { PackageManifest, WorkspacePackage, WorkspaceRegistry } from "./types";

/**
 *
 */
export function findWorkspaceRoot(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const workspaceYamlPath = path.join(currentDir, "pnpm-workspace.yaml");
    if (fs.existsSync(workspaceYamlPath)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  return null;
}

/**
 *
 */
export function readWorkspaceConfig(workspaceRoot: string): string[] {
  const workspaceYamlPath = path.join(workspaceRoot, "pnpm-workspace.yaml");
  const content = fs.readFileSync(workspaceYamlPath, "utf-8");
  const config = yaml.parse(content) as { packages?: string[] };
  return config.packages || [];
}

/**
 *
 */
export function buildWorkspaceRegistry(workspaceRoot: string): WorkspaceRegistry {
  const registry: WorkspaceRegistry = new Map();
  const packageGlobs = readWorkspaceConfig(workspaceRoot);

  for (const pattern of packageGlobs) {
    const matches = globSync(pattern, {
      cwd: workspaceRoot,
      absolute: false,
      ignore: ["**/node_modules/**"],
    });

    for (const match of matches) {
      const packageJsonPath = path.join(workspaceRoot, match, "package.json");
      if (!fs.existsSync(packageJsonPath)) {
        continue;
      }

      const manifest = fs.readJsonSync(packageJsonPath) as PackageManifest;
      if (!manifest.name) {
        continue;
      }

      registry.set(manifest.name, {
        name: manifest.name,
        absoluteDir: path.join(workspaceRoot, match),
        rootRelativeDir: match,
        manifest,
      });
    }
  }

  return registry;
}

/**
 *
 */
export function findInternalDependencies(
  pkgName: string,
  registry: WorkspaceRegistry,
  includeDevDeps: boolean,
): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [pkgName];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    const pkg = registry.get(current);
    if (!pkg) {
      continue;
    }

    const deps = pkg.manifest.dependencies || {};
    const devDeps = includeDevDeps ? pkg.manifest.devDependencies || {} : {};
    const allDeps = { ...deps, ...devDeps };

    for (const depName of Object.keys(allDeps)) {
      if (registry.has(depName) && !visited.has(depName)) {
        queue.push(depName);
      }
    }
  }

  visited.delete(pkgName);
  return visited;
}

/**
 *
 */
export function getPackageFromDir(
  sourceDir: string,
  registry: WorkspaceRegistry,
): WorkspacePackage {
  const resolvedSourceDir = path.resolve(sourceDir);

  for (const pkg of registry.values()) {
    if (path.resolve(pkg.absoluteDir) === resolvedSourceDir) {
      return pkg;
    }
  }

  throw new FirebaseError(
    `Source directory "${sourceDir}" is not a workspace package. Ensure it's listed in pnpm-workspace.yaml.`,
  );
}

import * as path from "path";
import * as fs from "fs-extra";
import * as yaml from "yaml";
import { logger } from "../../../logger";
import { WorkspaceRegistry } from "./types";

interface PnpmLockfile {
  lockfileVersion: string | number;
  importers?: Record<string, unknown>;
  packages?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 *
 */
export function readPnpmLockfile(workspaceRoot: string): PnpmLockfile | null {
  const lockfilePath = path.join(workspaceRoot, "pnpm-lock.yaml");
  if (!fs.existsSync(lockfilePath)) {
    logger.debug(`No pnpm-lock.yaml found at ${lockfilePath}`);
    return null;
  }

  try {
    const content = fs.readFileSync(lockfilePath, "utf-8");
    return yaml.parse(content) as PnpmLockfile;
  } catch (err) {
    logger.debug(`Failed to parse pnpm-lock.yaml: ${err}`);
    return null;
  }
}

/**
 *
 */
export function pruneLockfile(
  lockfile: PnpmLockfile,
  targetRelativeDir: string,
  internalDeps: Set<string>,
  registry: WorkspaceRegistry,
): PnpmLockfile {
  const pruned: PnpmLockfile = {
    lockfileVersion: lockfile.lockfileVersion,
  };

  if (!lockfile.importers) {
    return { ...lockfile };
  }

  const relevantDirs = new Set<string>([targetRelativeDir]);
  for (const depName of internalDeps) {
    const pkg = registry.get(depName);
    if (pkg) {
      relevantDirs.add(pkg.rootRelativeDir);
    }
  }

  pruned.importers = {};
  for (const [importerPath, importerData] of Object.entries(lockfile.importers)) {
    const normalizedPath = importerPath === "." ? targetRelativeDir : importerPath;
    if (relevantDirs.has(normalizedPath) || relevantDirs.has(importerPath)) {
      pruned.importers[importerPath] = importerData;
    }
  }

  if (lockfile.packages) {
    pruned.packages = lockfile.packages;
  }

  for (const [key, value] of Object.entries(lockfile)) {
    if (!["lockfileVersion", "importers", "packages"].includes(key)) {
      pruned[key] = value;
    }
  }

  return pruned;
}

/**
 *
 */
export function writePrunedLockfile(lockfile: PnpmLockfile, outputPath: string): void {
  const content = yaml.stringify(lockfile, {
    lineWidth: 0,
    defaultKeyType: "PLAIN",
    defaultStringType: "QUOTE_DOUBLE",
  });
  fs.writeFileSync(outputPath, content, "utf-8");
  logger.debug(`Wrote pruned lockfile to ${outputPath}`);
}

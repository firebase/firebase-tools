import * as path from "path";
import * as fs from "fs-extra";
import { FirebaseError } from "../../../error";
import { logger } from "../../../logger";
import { logLabeledBullet } from "../../../utils";
import { IsolateOptions, IsolateResult, WorkspaceRegistry } from "./types";
import {
  findWorkspaceRoot,
  buildWorkspaceRegistry,
  findInternalDependencies,
  getPackageFromDir,
} from "./registry";
import { packAndExtract } from "./pack";
import { rewriteWorkspaceDependencies, writeAdaptedManifest } from "./manifest";
import { readPnpmLockfile, pruneLockfile, writePrunedLockfile } from "./lockfile";

function copyPackageSource(sourceDir: string, destDir: string): void {
  fs.ensureDirSync(destDir);

  const items = fs.readdirSync(sourceDir);
  for (const item of items) {
    if (item === "node_modules" || item === "_isolated_") {
      continue;
    }

    const srcPath = path.join(sourceDir, item);
    const destPath = path.join(destDir, item);

    fs.copySync(srcPath, destPath, {
      filter: (src) => !src.includes("node_modules"),
    });
  }
}

function writePnpmWorkspaceYaml(outputDir: string): void {
  const content = `packages:\n  - "workspaces/*"\n`;
  fs.writeFileSync(path.join(outputDir, "pnpm-workspace.yaml"), content, "utf-8");
}

/**
 *
 */
export async function isolateWorkspace(options: IsolateOptions): Promise<IsolateResult> {
  const { sourceDir, outputDir, includeDevDependencies } = options;

  logLabeledBullet("functions", "isolating workspace dependencies...");

  const workspaceRoot = findWorkspaceRoot(sourceDir);
  if (!workspaceRoot) {
    throw new FirebaseError(
      "Could not find pnpm-workspace.yaml. Workspace isolation requires a pnpm monorepo.",
    );
  }

  logger.debug(`Found workspace root at ${workspaceRoot}`);

  const registry: WorkspaceRegistry = buildWorkspaceRegistry(workspaceRoot);
  logger.debug(`Built workspace registry with ${registry.size} packages`);

  const targetPackage = getPackageFromDir(sourceDir, registry);
  logger.debug(`Target package: ${targetPackage.name}`);

  const internalDeps = findInternalDependencies(
    targetPackage.name,
    registry,
    includeDevDependencies,
  );
  logger.debug(`Found ${internalDeps.size} internal dependencies: ${[...internalDeps].join(", ")}`);

  if (fs.existsSync(outputDir)) {
    fs.removeSync(outputDir);
  }
  fs.ensureDirSync(outputDir);

  copyPackageSource(sourceDir, outputDir);
  logger.debug(`Copied source to ${outputDir}`);

  const workspacesDir = path.join(outputDir, "workspaces");
  const packagesIncluded: string[] = [targetPackage.name];

  if (internalDeps.size > 0) {
    fs.ensureDirSync(workspacesDir);

    for (const depName of internalDeps) {
      const depPackage = registry.get(depName);
      if (!depPackage) {
        continue;
      }

      await packAndExtract(depPackage, workspacesDir);
      packagesIncluded.push(depName);

      const safeName = depName.replace(/^@/, "").replace(/\//g, "-");
      const depDir = path.join(workspacesDir, safeName);
      const depManifestPath = path.join(depDir, "package.json");

      if (fs.existsSync(depManifestPath)) {
        const depManifest = fs.readJsonSync(depManifestPath);
        const rewrittenDepManifest = rewriteWorkspaceDependencies(
          depManifest,
          registry,
          internalDeps,
          depDir,
          workspacesDir,
        );
        writeAdaptedManifest(rewrittenDepManifest, depManifestPath);
      }
    }
  }

  const targetManifestPath = path.join(outputDir, "package.json");
  if (fs.existsSync(targetManifestPath)) {
    const targetManifest = fs.readJsonSync(targetManifestPath);
    const rewrittenManifest = rewriteWorkspaceDependencies(
      targetManifest,
      registry,
      internalDeps,
      outputDir,
      workspacesDir,
    );
    writeAdaptedManifest(rewrittenManifest, targetManifestPath);
  }

  const lockfile = readPnpmLockfile(workspaceRoot);
  if (lockfile) {
    const prunedLockfile = pruneLockfile(
      lockfile,
      targetPackage.rootRelativeDir,
      internalDeps,
      registry,
    );
    writePrunedLockfile(prunedLockfile, path.join(outputDir, "pnpm-lock.yaml"));
  } else {
    logger.debug("No lockfile found, skipping lockfile pruning");
  }

  if (internalDeps.size > 0) {
    writePnpmWorkspaceYaml(outputDir);
  }

  logLabeledBullet(
    "functions",
    `isolated ${packagesIncluded.length} package(s) to ${path.relative(options.projectDir, outputDir)}`,
  );

  return {
    isolatedDir: outputDir,
    packagesIncluded,
  };
}

import {
  PackageManager,
  PackageManagerDependency,
  PlatformMetadata,
  PlatformAdapter,
  PlatformAdapterNode,
  PlatformAdapterResult,
} from "../interfaces";
import { discoverNpmPackageManager } from "./packagemanager/npmPackageManager";
import { readdirSync } from "fs";
import * as path from "path";

/**
 *
 */
export async function discover(
  targetAdapterNode: PlatformAdapterNode,
  metadata: PlatformMetadata = {}
): Promise<PlatformAdapterResult[]> {
  if (metadata.adapter && metadata.stack_directory) {
    return [
      {
        adapter: metadata.adapter,
        directory: metadata.stack_directory,
        directory_depth: 0,
        confidence_score: 100,
      },
    ];
  }
  if (metadata.stack_directory) {
    return await discoverByDirectory(targetAdapterNode, metadata.stack_directory);
  }

  return await discoverProjectRecursively(targetAdapterNode);
}

/**
 *
 */
export async function discoverProjectRecursively(
  targetAdapterNode: PlatformAdapterNode,
  stackDirectory = ""
): Promise<PlatformAdapterResult[]> {
  if (!stackDirectory) {
    stackDirectory = path.resolve();
  }
  const results = [];
  const directoryDepthList = [{ directory: stackDirectory, depth: 0 }];
  while (directoryDepthList.length) {
    const directoryNameWithDepth = directoryDepthList.pop();
    if (!directoryNameWithDepth) {
      break;
    }
    const { directory, depth } = directoryNameWithDepth;
    if (directory) {
      results.push(...(await discoverByDirectory(targetAdapterNode, directory, depth)));

      const ignored = ["node_modules"];
      const childDirectories = readdirSync(directory, { withFileTypes: true })
        .filter((fileOrDir) => fileOrDir.isDirectory())
        .filter((dir) => !ignored.includes(dir.name))
        .map((dir) => (path.resolve(directory, dir.name)))
        .map((childDirectory) => ({ directory: childDirectory, depth: depth + 1 }));

      directoryDepthList.push(...childDirectories);
    }
  }
  return results;
}

/**
 *
 */
export async function discoverByDirectory(
  targetAdapterNode: PlatformAdapterNode,
  directory: string,
  directoryDepth = 0
) {
  const results: PlatformAdapterResult[] = [];
  const scoredAdapters = [{ adapterNode: targetAdapterNode, parentScore: 0 }];

  while (scoredAdapters.length) {
    const scoredAdapterNode = scoredAdapters.pop();
    if (!scoredAdapterNode) {
      break;
    }
    const { adapterNode, parentScore } = scoredAdapterNode;
    const discoveredScore = await getAdapterScore(adapterNode.adapter, directory);
    const combinedScore = parentScore + discoveredScore;

    if (discoveredScore > 0 && adapterNode.adapter) {
      results.push({
        adapter: adapterNode.adapter,
        directory,
        directory_depth: directoryDepth,
        confidence_score: combinedScore,
      });

      if (adapterNode.children.length) {
        // Append all children to check
        scoredAdapters.push(
          ...adapterNode.children.map((childAdapterNode: PlatformAdapterNode) => ({
            adapterNode: childAdapterNode,
            parentScore: combinedScore,
          }))
        );
      }
    }
  }
  return results;
}

/**
 *
 */
export async function getAdapterScore(
  adapter: PlatformAdapter,
  directory: string
): Promise<number> {
  let score = 0;

  const files = new Set(readdirSync(directory));
  const { discover } = adapter;

  for (const requiredFile of discover?.required_files || []) {
    if (!files.has(requiredFile)) {
      return 0;
    }
    score++;
  }
  for (const optionalFile of discover?.optional_files || []) {
    if (files.has(optionalFile)) {
      score++;
    }
  }
  if (discover.required_package_dependency) {
    const byPackageManager = await discoverByPackageManager(
      discover.required_package_dependency,
      directory
    );
    if (!byPackageManager) {
      return 0;
    }
    score++;
  }

  return score;
}

/**
 *
 */
export async function discoverByPackageManager(
  packageDependency: PackageManagerDependency,
  directory: string
): Promise<boolean> {
  switch (packageDependency.packageManager) {
    case PackageManager.UNKNOWN:
      return false;
    case PackageManager.NPM:
      return await discoverNpmPackageManager(packageDependency, directory);
  }

  return false;
}

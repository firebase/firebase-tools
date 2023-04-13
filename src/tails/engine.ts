import { promisify } from "util";
import { readFile, exists } from "fs";
import { join } from "path";

import * as node from "./node";

export interface Strategy {
  runtimeName: string;
  frameworkName: string;

  packageManagerInstallCommand(): string | null;
  installCommand(): string | null;
  buildCommand(): string | null;
  devCommand(): string | null;
}

export type Detector = (fs: FileSystem) => Promise<Strategy | null>;

export interface Framework {
  name: string;

  // Parent can be a Platform or another Framework
  parent: string;
  installCommand?: string;
  buildCommand?: string;
  devCommand?: string;
  vars?: Record<string, string>;

  canEmbed?: string[];

  // It is expected that a framework will have at least one of these
  requiredFiles?: (string | string[])[];
  dependencies?: { name: string; version?: string }[];
}

/**
 *
 */
export function interpolate(template: string | null, vars?: Record<string, string>): string | null {
  if (!template) {
    return template;
  }
  return template.replaceAll(/\${(.*)}/g, (_, varName: string) => vars?.[varName] || "");
}

// TODO: optimize
/**
 *
 */
export function vars(frameworks: Framework[]): Record<string, string> {
  let vars = {};
  for (let i = frameworks.length - 1; i >= 0; i--) {
    vars = { ...vars, ...frameworks[i].vars };
  }
  return vars;
}
// This should be hard-coded. The engine statically supports a runtime or not.
const allDetectors: Detector[] = [node.detect];

/**
 * Detects
 */
export async function detect(fs: FileSystem): Promise<Strategy | null> {
  const matches = await Promise.all(allDetectors.map((fn) => fn(fs)));
  let match: Strategy | null = null;
  for (const res of matches) {
    if (!res) {
      continue;
    }
    if (match) {
      throw new Error("More than one runtime matched codebase");
    }
    match = res;
  }
  return match;
}

export interface FileSystem {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
}

export class RealFileSystem implements FileSystem {
  private readonly existsCache: Record<string, boolean> = {};
  private readonly contentCache: Record<string, string> = {};

  // We can't create a SystemError dynamically. This is sorta a hack
  private readonly readErrorCache: Record<string, Error> = {};

  constructor(private readonly cwd: string) {}
  async exists(path: string): Promise<boolean> {
    if (!(path in this.existsCache)) {
      this.existsCache[path] = await promisify(exists)(join(this.cwd, path));
    }
    return this.existsCache[path];
  }

  async read(path: string): Promise<string> {
    if (this.readErrorCache[path]) {
      throw this.readErrorCache[path];
    }
    if (!(path in this.contentCache)) {
      try {
        const buff = await promisify(readFile)(join(this.cwd, path));
        this.contentCache[path] = buff.toString("utf-8");
      } catch (err) {
        if ((err as any).code === "ENOENT") {
          this.readErrorCache[path] = err as Error;
        }
        throw err;
      }
    }
    return this.contentCache[path];
  }
}

export class MockFileSystem implements FileSystem {
  constructor(private readonly mock: Record<string, string>) {}
  exists(path: string): Promise<boolean> {
    return Promise.resolve(path in this.mock);
  }
  read(path: string): Promise<string> {
    if (!(path in this.mock)) {
      const err = new Error("file not found");
      (err as any).code = "ENOENT";
      throw err;
    }
    return Promise.resolve(this.mock[path]);
  }
}

// TODO: make shared and caching
export class FrameworkMatcher {
  readonly frameworks: Record<string, Framework> = {};
  readonly children: Record<string, string[]> = {};

  constructor(
    private readonly runtime: string,
    // TODO: consider a caching fs wrapper
    private readonly fs: FileSystem,
    frameworks: Framework[],
    private dependencies: Record<string, string>
  ) {
    for (const framework of frameworks) {
      this.frameworks[framework.name] = framework;
      this.children[framework.parent] = this.children[framework.parent] || [];
      this.children[framework.parent].push(framework.name);
    }

    // sanity check:
    for (const framework of frameworks) {
      if (framework.parent !== runtime && !this.frameworks[framework.parent]) {
        throw new Error(`Framework ${framework.name} has unkonwn parent ${framework.parent}`);
      }
    }
  }

  async match(): Promise<Framework[]> {
    const allMatches = await this.matchHelper(this.runtime);

    // Eliminate matches embedded in other matches
    for (let i = 0; i < allMatches.length; i++) {
      for (let j = 0; j < allMatches.length; j++) {
        if (i === j) {
          continue;
        }
        if (supercedes(allMatches[i], allMatches[j])) {
          allMatches.splice(j, 1);
          j--;
          continue;
        }
        if (supercedes(allMatches[j], allMatches[i])) {
          allMatches.splice(i, 1);
          i--;
          break;
        }
      }
    }

    if (!allMatches.length) {
      return [];
    } else if (allMatches.length === 1) {
      return allMatches[0];
    } else {
      const leaves = allMatches.map((chain) => chain[0].name);
      throw new Error(
        `Matched multiple frameworks that are not known to embed each other: ${leaves.join(", ")}`
      );
    }
  }

  private async matchHelper(framework: string): Promise<Framework[][]> {
    if (framework !== this.runtime) {
      for (const dep of this.frameworks[framework].dependencies || []) {
        const match = this.dependencies[dep.name];
        if (!match) {
          return [];
        }
        // TODO: version matching
      }
      const filesMatch = await Promise.all(
        (this.frameworks[framework].requiredFiles || []).map(async (fileOrSet) => {
          if (typeof fileOrSet === "string") {
            return this.fs.exists(fileOrSet);
          }
          const options = await Promise.all(fileOrSet.map((file) => this.fs.exists(file)));
          return options.some((x) => x);
        })
      );
      if (!filesMatch.every((x) => x)) {
        return [];
      }
    }

    let paths: Framework[][] = [];
    await Promise.all(
      (this.children[framework] || []).map(async (name) => {
        const res = await this.matchHelper(name);
        if (!res.length) {
          return;
        }
        paths = [...paths, ...res];
      })
    );

    if (framework === this.runtime) {
      return paths;
    }
    if (!paths.length) {
      return [[this.frameworks[framework]]];
    }
    return paths.map((head) => [...head, this.frameworks[framework]]);
  }
}

function supercedes(found: Framework[], have: Framework[]): boolean {
  for (const test of found) {
    if (!test.canEmbed) {
      continue;
    }
    for (const name of test.canEmbed) {
      if (have.some((framework) => framework.name === name)) {
        return true;
      }
    }
  }
  return false;
}

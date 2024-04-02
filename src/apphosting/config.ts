import * as path from "path";
import { writeFileSync } from "fs";
import * as yaml from "js-yaml";

import * as fs from "../fsutils";

export interface RunConfig {
  concurrency?: number;
  cpu?: number;
  memoryMiB?: number;
  minInstances?: number;
  maxInstances?: number;
}

/** Where an environment variable can be provided. */
export type Availability = "BUILD" | "RUNTIME";

/** Config for an environment variable. */
export type Env = {
  variable: string;
  secret?: string;
  value?: string;
  availability?: Availability[];
};

/** Schema for apphosting.yaml. */
export interface Config {
  runConfig?: RunConfig;
  env?: Env[];
}

/**
 * Finds the path of apphosting.yaml.
 * Starts with cwd and walks up the tree until apphosting.yaml is found or
 * we find the project root (where firebase.json is) or the filesystem root;
 * in these cases, returns null.
 */
export function yamlPath(cwd: string): string | null {
  let dir = cwd;

  while (!fs.fileExistsSync(path.resolve(dir, "apphosting.yaml"))) {
    // We've hit project root
    if (fs.fileExistsSync(path.resolve(dir, "firebase.json"))) {
      return null;
    }

    const parent = path.dirname(dir);
    // We've hit the filesystem root
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
  return path.resolve(dir, "apphosting.yaml");
}

/** Load apphosting.yaml */
export function load(yamlPath: string): Config {
  const raw = fs.readFile(yamlPath);
  return yaml.load(raw, yaml.DEFAULT_FULL_SCHEMA) as Config;
}

/** Save apphosting.yaml */
export function store(yamlPath: string, config: Config): void {
  writeFileSync(yamlPath, yaml.dump(config));
}

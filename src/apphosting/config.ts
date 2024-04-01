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

interface HasSecret {
  secret: string;
  value: never;
}
interface HasValue {
  secret: never;
  value: string;
}
export type Availability = "BUILD" | "RUNTIME";

export type Env = (HasSecret | HasValue) & {
  variable: string;
  availability?: Availability[];
};

export interface Config {
  runConfig?: RunConfig;
  env?: Env[];
}

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

export function load(yamlPath: string): Config {
  const raw = fs.readFile(yamlPath);
  return yaml.load(raw, yaml.DEFAULT_FULL_SCHEMA) as Config;
}

export function store(yamlPath: string, config: Config): void {
  writeFileSync(yamlPath, yaml.dump(config));
}

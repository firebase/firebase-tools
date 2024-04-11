import * as path from "path";
import { writeFileSync } from "fs";
import * as yaml from "yaml";

import * as fs from "../fsutils";
import { NodeType } from "yaml/dist/nodes/Node";

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
export function load(yamlPath: string): yaml.Document {
  const raw = fs.readFile(yamlPath);
  yaml.parse(raw);
  return yaml.parseDocument(raw);
}

/** Save apphosting.yaml */
export function store(yamlPath: string, document: yaml.Document): void {
  writeFileSync(yamlPath, document.toString());
}

export function getEnv(document: yaml.Document, variable: string): Env | undefined {
  if (!document.has("env")) {
    return undefined;
  }
  const envs = document.get("env") as yaml.YAMLSeq;
  for (const env of envs.items as Array<NodeType<Env>>) {
    if ((env.get("variable") as unknown) === variable) {
      return env.toJSON() as Env;
    }
  }
  return undefined;
}

export function setEnv(document: yaml.Document, env: Env): void {
  if (!document.has("env")) {
    document.set("env", document.createNode([env]));
    return;
  }
  const envs = document.get("env") as yaml.YAMLSeq<NodeType<Env>>;

  // The type system in this library is... not great at propagating type info
  const envYaml = document.createNode(env);
  for (let i = 0; i < envs.items.length; i++) {
    if ((envs.items[i].get("variable") as unknown) === env.variable) {
      // Note to reviewers: Should we instead set per each field so that we preserve comments?
      envs.set(i, envYaml);
      return;
    }
  }

  envs.add(envYaml);
}

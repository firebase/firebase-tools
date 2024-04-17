import { resolve, join, dirname } from "path";
import { writeFileSync } from "fs";
import * as yaml from "yaml";

import * as fs from "../fsutils";
import { NodeType } from "yaml/dist/nodes/Node";
import * as prompt from "../prompt";
import * as dialogs from "./secrets/dialogs";

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

  while (!fs.fileExistsSync(resolve(dir, "apphosting.yaml"))) {
    // We've hit project root
    if (fs.fileExistsSync(resolve(dir, "firebase.json"))) {
      return null;
    }

    const parent = dirname(dir);
    // We've hit the filesystem root
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
  return resolve(dir, "apphosting.yaml");
}

/** Load apphosting.yaml */
export function load(yamlPath: string): yaml.Document {
  const raw = fs.readFile(yamlPath);
  return yaml.parseDocument(raw);
}

/** Save apphosting.yaml */
export function store(yamlPath: string, document: yaml.Document): void {
  writeFileSync(yamlPath, document.toString());
}

/** Gets the first Env with a given variable name. */
export function findEnv(document: yaml.Document, variable: string): Env | undefined {
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

/** Inserts or overwrites the first Env with the env.variable name. */
export function upsertEnv(document: yaml.Document, env: Env): void {
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

/**
 * Given a secret name, guides the user whether they want to add that secret to apphosting.yaml.
 * If an apphosting.yaml exists and includes the secret already is used as a variable name, exist early.
 * If apphosting.yaml does not exist, offers to create it.
 * If env does not exist, offers to add it.
 * If secretName is not a valid env var name, prompts for an env var name.
 */
export async function maybeAddSecretToYaml(secretName: string): Promise<void> {
  // We must go through the exports object for stubbing to work in tests.
  const dynamicDispatch = exports as {
    yamlPath: typeof yamlPath;
    load: typeof load;
    findEnv: typeof findEnv;
    upsertEnv: typeof upsertEnv;
    store: typeof store;
  };
  // Note: The API proposal suggested that we would check if the env exists. This is stupidly hard because the YAML may not exist yet.
  let path = dynamicDispatch.yamlPath(process.cwd());
  let projectYaml: yaml.Document;
  if (path) {
    projectYaml = dynamicDispatch.load(path);
  } else {
    projectYaml = new yaml.Document();
  }
  // TODO: Should we search for any env where it has secret: secretName rather than variable: secretName?
  if (dynamicDispatch.findEnv(projectYaml, secretName)) {
    return;
  }
  const addToYaml = await prompt.confirm({
    message: "Would you like to add this secret to apphosting.yaml?",
    default: true,
  });
  if (!addToYaml) {
    return;
  }
  if (!path) {
    path = await prompt.promptOnce({
      message:
        "It looks like you don't have an apphosting.yaml yet. Where would you like to store it?",
      default: process.cwd(),
    });
    path = join(path, "apphosting.yaml");
  }
  const envName = await dialogs.envVarForSecret(secretName);
  dynamicDispatch.upsertEnv(projectYaml, {
    variable: envName,
    secret: secretName,
  });
  dynamicDispatch.store(path, projectYaml);
}

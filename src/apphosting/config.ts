import { resolve, join, dirname } from "path";
import { writeFileSync } from "fs";
import * as yaml from "yaml";

import * as fs from "../fsutils";
import { NodeType } from "yaml/dist/nodes/Node";
import * as prompt from "../prompt";
import * as dialogs from "./secrets/dialogs";
import { AppHostingYamlConfig } from "./yaml";

export const APPHOSTING_BASE_YAML_FILE = "apphosting.yaml";
export const APPHOSTING_LOCAL_YAML_FILE = "apphosting.local.yaml";
export const APPHOSTING_YAML_FILE_REGEX = /^apphosting(\.[a-z0-9_]+)?\.yaml$/;

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
 * Returns the absolute path for an app hosting backend root.
 *
 * Backend root is determined by looking for an apphosting.yaml
 * file.
 */
export function discoverBackendRoot(cwd: string): string | null {
  let dir = cwd;

  while (!fs.fileExistsSync(resolve(dir, APPHOSTING_BASE_YAML_FILE))) {
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

  return dir;
}

/**
 * Returns paths of apphosting config files in the given path
 * */
export function listAppHostingFilesInPath(path: string) {
  return fs
    .listFiles(path)
    .filter((file) => APPHOSTING_YAML_FILE_REGEX.test(file))
    .map((file) => join(path, file));
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
    discoverBackendRoot: typeof discoverBackendRoot;
    load: typeof load;
    findEnv: typeof findEnv;
    upsertEnv: typeof upsertEnv;
    store: typeof store;
  };
  // Note: The API proposal suggested that we would check if the env exists. This is stupidly hard because the YAML may not exist yet.
  const backendRoot = dynamicDispatch.discoverBackendRoot(process.cwd());
  let path: string | undefined;
  let projectYaml: yaml.Document;
  if (backendRoot) {
    path = join(backendRoot, APPHOSTING_BASE_YAML_FILE);
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
    path = join(path, APPHOSTING_BASE_YAML_FILE);
  }
  const envName = await dialogs.envVarForSecret(secretName);
  dynamicDispatch.upsertEnv(projectYaml, {
    variable: envName,
    secret: secretName,
  });
  dynamicDispatch.store(path, projectYaml);
}

/**
 * Given apphosting yaml config paths this function returns the
 * appropriate combined configuration.
 *
 * Environment specific config (i.e apphosting.<environment>.yaml) will
 * take precedence over the base config (apphosting.yaml).
 *
 * @param envYamlPath: Example: "/home/my-project/apphosting.staging.yaml"
 * @param baseYamlPath: Example: "/home/my-project/apphosting.yaml"
 */
export async function loadConfigForEnvironment(
  envYamlPath: string,
  baseYamlPath?: string,
): Promise<AppHostingYamlConfig> {
  const envYamlConfig = await AppHostingYamlConfig.loadFromFile(envYamlPath);

  // if the base file exists we'll include it
  if (baseYamlPath) {
    const baseConfig = await AppHostingYamlConfig.loadFromFile(baseYamlPath);

    // if the user had selected the base file only, thats okay becuase logic below won't alter the config or cause duplicates
    baseConfig.merge(envYamlConfig);
    return baseConfig;
  }

  return envYamlConfig;
}

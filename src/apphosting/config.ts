import { resolve, join, dirname, basename } from "path";
import { writeFileSync } from "fs";
import * as yaml from "yaml";

import * as fs from "../fsutils";
import { NodeType } from "yaml/dist/nodes/Node";
import * as prompt from "../prompt";
import * as dialogs from "./secrets/dialogs";
import { AppHostingYamlConfig } from "./yaml";
import { FirebaseError } from "../error";
import { promptForAppHostingYaml } from "./utils";
import { fetchSecrets } from "./secrets";
import { logger } from "../logger";
import { updateOrCreateGitignore } from "../utils";
import { getOrPromptProject } from "../management/projects";
import * as csm from "../gcp/secretManager";

// Common config across all environments
export const APPHOSTING_BASE_YAML_FILE = "apphosting.yaml";

// Modern version of local configuration that is intended to be safe to commit.
// In order to ensure safety, values that are secret environment variables in
// apphosting.yaml cannot be made plaintext in apphosting.emulators.yaml
export const APPHOSTING_EMULATORS_YAML_FILE = "apphosting.emulator.yaml";

// Legacy/undocumented version of local configuration that is allowed to store
// values that are secrets in preceeding files as plaintext. It is not safe
// to commit to SCM
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

const SECRET_CONFIG = "Secret";
const EXPORTABLE_CONFIG = [SECRET_CONFIG];

/**
 * Returns the absolute path for an app hosting backend root.
 *
 * Backend root is determined by looking for an apphosting.yaml
 * file.
 */
export function discoverBackendRoot(cwd: string): string | null {
  let dir = cwd;

  while (true) {
    const files = fs.listFiles(dir);
    if (files.some((file) => APPHOSTING_YAML_FILE_REGEX.test(file))) {
      return dir;
    }

    // We've hit project root
    if (files.includes("firebase.json")) {
      return null;
    }

    const parent = dirname(dir);
    // We've hit the filesystem root
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

/**
 * Returns paths of apphosting config files in the given path
 */
export function listAppHostingFilesInPath(path: string): string[] {
  return fs
    .listFiles(path)
    .filter((file) => APPHOSTING_YAML_FILE_REGEX.test(file))
    .map((file) => join(path, file));
}

/**
 * Load an apphosting yaml file if it exists.
 * Throws if the file exists but is malformed.
 * Returns an empty document if the file does not exist.
 */
export function load(yamlPath: string): yaml.Document {
  let raw: string;
  try {
    raw = fs.readFile(yamlPath);
  } catch (err) {
    return new yaml.Document();
  }
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

// We must go through the exports object for stubbing to work in tests.
const dynamicDispatch = exports as {
  discoverBackendRoot: typeof discoverBackendRoot;
  load: typeof load;
  findEnv: typeof findEnv;
  upsertEnv: typeof upsertEnv;
  store: typeof store;
  overrideChosenEnv: typeof overrideChosenEnv;
};
/**
 * Given a secret name, guides the user whether they want to add that secret to apphosting.yaml.
 * If an apphosting.yaml exists and includes the secret already is used as a variable name, exist early.
 * If apphosting.yaml does not exist, offers to create it.
 * If env does not exist, offers to add it.
 * If secretName is not a valid env var name, prompts for an env var name.
 */
export async function maybeAddSecretToYaml(
  secretName: string,
  fileName: string = APPHOSTING_BASE_YAML_FILE,
): Promise<void> {
  // Note: The API proposal suggested that we would check if the env exists. This is stupidly hard because the YAML may not exist yet.
  const backendRoot = dynamicDispatch.discoverBackendRoot(process.cwd());
  let path: string | undefined;
  let projectYaml: yaml.Document;
  if (backendRoot) {
    path = join(backendRoot, fileName);
    projectYaml = dynamicDispatch.load(path);
  } else {
    projectYaml = new yaml.Document();
  }
  // TODO: Should we search for any env where it has secret: secretName rather than variable: secretName?
  if (dynamicDispatch.findEnv(projectYaml, secretName)) {
    return;
  }
  const addToYaml = await prompt.confirm({
    message: `Would you like to add this secret to ${fileName}?`,
    default: true,
  });
  if (!addToYaml) {
    return;
  }
  if (!path) {
    path = await prompt.promptOnce({
      message: `It looks like you don't have an ${fileName} yet. Where would you like to store it?`,
      default: process.cwd(),
    });
    path = join(path, fileName);
  }
  const envName = await dialogs.envVarForSecret(
    secretName,
    /* removeTestPrefix */ fileName === APPHOSTING_EMULATORS_YAML_FILE,
  );
  dynamicDispatch.upsertEnv(projectYaml, {
    variable: envName,
    secret: secretName,
  });
  dynamicDispatch.store(path, projectYaml);
}

/**
 * Generates an apphosting.emulator.yaml if the user chooses to do so.
 * Returns the resolved env that an emulator would see so that future code can
 * grant access. 
 */
export async function maybeGenerateEmulatorYaml(projectId: string, repoRoot: string): Promise<Env[]| null> {
  // Even if the app is in /project/app, the user might have their apphosting.yaml file in /project/apphosting.yaml.
  // Walk up the tree to see if we find other local files so that we can put apphosting.emulator.yaml in the right place.
  const basePath = dynamicDispatch.discoverBackendRoot(repoRoot) || repoRoot;
  if (fs.fileExistsSync(join(basePath, APPHOSTING_EMULATORS_YAML_FILE))) {
    logger.debug("apphosting.emulator.yaml already exists, skipping generation and secrets access prompt");
    return null;
  }

  let baseConfig: AppHostingYamlConfig;
  try {
    baseConfig = await AppHostingYamlConfig.loadFromFile(join(basePath, APPHOSTING_BASE_YAML_FILE));
  } catch {
    baseConfig = AppHostingYamlConfig.empty();
  }
  const createFile = await prompt.confirm({
    message: "The App Hosting emulator uses a file called apphosting.emulator.yaml to override " +
      "values in apphosting.yaml for local testing. This codebase does not have one, would you like " +
      "to create it?",
    default: true,
  });
  if (!createFile) {
    return Object.values(baseConfig.env);
  }

  const newEnv = await dynamicDispatch.overrideChosenEnv(projectId, baseConfig.env || {});
  const newYaml = new yaml.Document();
  for (const env of Object.values(newEnv)) {
    dynamicDispatch.upsertEnv(newYaml, env);
  }
  dynamicDispatch.store(join(basePath, APPHOSTING_EMULATORS_YAML_FILE), newYaml);
  return Object.values({...baseConfig.env, ...newEnv});
}

export async function overrideChosenEnv(projectId: string, env: Record<string, Env>): Promise<Record<string, Env>> {
  const names = Object.keys(env);
  if (!names.length) {
    return {};
  }
  const toOverwrite = await prompt.promptOnce({
    type: "checkbox",
    message: "Which environment variables would you like to override? Press Space to select and Enter to confirm your choices",
    choices: names,
  });

  const newEnv: Record<string, Env> = {};
  for (const name of toOverwrite) {
    if ("value" in env[name]) {
       const newValue = await prompt.promptOnce({
        type: "input",
        message: `What new value would you like for plaintext ${name}?`,
       });
       newEnv[name] = {
         variable: name,
         value: newValue,
       };
       continue;
    }

    let secretRef: string;
    let action: "reuse" | "create" | "pick-new" = "pick-new";
    while (action === "pick-new") {
      secretRef = await prompt.promptOnce({
        type: "input",
        message: `What would you like to name the secret reference for ${name}?`,
        // TODO: kebab case + test
        default: name,
      });
      if (await csm.secretExists(projectId, secretRef)) {
        action = await prompt.promptOnce({
          type: "list",
          message: "This secret reference already exists, would you like to reuse it or create a new one?",
          choices: [
            {"name": "Reuse it", value: "reuse"},
            {"name": "Create a new one", value: "pick-new"},
          ],
        });
      } else {
        action = "create";
      }
    }
    newEnv[name] = {
      variable: name,
      secret: secretRef!,
    };
    if (action === "reuse") {
      continue;
    }
    const secretValue = await prompt.promptOnce({
      type: "password",
      message: `What new value would you like for secret ${name} [input is hidden]?`,
    });
    // TODO: Do we need to support overriding locations? Inferring them from the original?
    await csm.createSecret(projectId, secretRef!, {[csm.FIREBASE_MANAGED]: "apphosting"});
    await csm.addVersion(projectId, secretRef!, secretValue);
  }
  return newEnv;
}
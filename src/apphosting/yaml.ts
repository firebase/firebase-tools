import { basename, dirname } from "path";
import { readFileFromDirectory, wrappedSafeLoad } from "../utils";
import { Config, Env, store } from "./config";
import * as yaml from "yaml";
import * as jsYaml from "js-yaml";
import { fileExistsSync } from "../fsutils";
import { FirebaseError } from "../error";

export type EnvironmentVariable = Omit<Env, "secret">;
export type Secret = Omit<Env, "availability" | "value">;

/**
 * AppHostingYamlConfig is an object representing an apphosting.yaml configuration
 * present in the user's codebase (i.e 'apphosting.yaml', 'apphosting.staging.yaml', etc).
 */
export class AppHostingYamlConfig {
  private _environmentVariables: Map<string, EnvironmentVariable>;
  private _secrets: Map<string, Secret>;

  /**
   * Reads in the App Hosting yaml file found in filePath, parses the secrets and
   * environment variables, and returns an object that makes it easier to
   * programatically read or manipulate the App Hosting config.
   */
  static async loadFromFile(filePath: string): Promise<AppHostingYamlConfig> {
    const config = new AppHostingYamlConfig();
    if (!fileExistsSync(filePath)) {
      throw new FirebaseError("Cannot load AppHostingYamlConfig from given path, it doesn't exist");
    }

    const file = await readFileFromDirectory(dirname(filePath), basename(filePath));
    const loadedAppHostingYaml = (await wrappedSafeLoad(file.source)) ?? {};

    if (loadedAppHostingYaml.env) {
      const parsedEnvs = parseEnv(loadedAppHostingYaml.env);
      config._environmentVariables = parsedEnvs.environmentVariables;
      config._secrets = parsedEnvs.secrets;
    }

    return config;
  }

  /**
   * Simply returns an empty AppHostingYamlConfig (no environment variables
   * or secrets).
   */
  static empty() {
    return new AppHostingYamlConfig();
  }

  private constructor() {
    this._environmentVariables = new Map();
    this._secrets = new Map();
  }

  get environmentVariables(): EnvironmentVariable[] {
    return mapToArray(this._environmentVariables);
  }

  get secrets(): Secret[] {
    return mapToArray(this._secrets);
  }

  addEnvironmentVariable(env: EnvironmentVariable) {
    this._environmentVariables.set(env.variable, env);
  }

  addSecret(secret: Secret) {
    this._secrets.set(secret.variable, secret);
  }

  clearSecrets() {
    this._secrets.clear();
  }

  /**
   * Merges this AppHostingYamlConfig with another config, the incoming config
   * has precedence if there are any conflicting configurations.
   * */
  merge(other: AppHostingYamlConfig) {
    for (const [key, value] of other._environmentVariables) {
      this._environmentVariables.set(key, value);
    }

    for (const [key, value] of other._secrets) {
      this._secrets.set(key, value);
    }
  }

  /**
   * Loads the given file if it exists and updates it. If
   * it does not exist a new file will be created.
   */
  async upsertFile(filePath: string) {
    let yamlConfigToWrite: Config = {};

    if (fileExistsSync(filePath)) {
      const file = await readFileFromDirectory(dirname(filePath), basename(filePath));
      yamlConfigToWrite = await wrappedSafeLoad(file.source);
    }

    yamlConfigToWrite.env = [...this.environmentVariables, ...this.secrets];

    store(filePath, yaml.parseDocument(jsYaml.dump(yamlConfigToWrite)));
  }
}

function parseEnv(envs: Env[]) {
  const environmentVariables = new Map<string, EnvironmentVariable>();
  const secrets = new Map<string, Secret>();

  for (const env of envs) {
    if (env.value) {
      environmentVariables.set(env.variable, env);
    }

    if (env.secret) {
      secrets.set(env.variable, env);
    }
  }

  return {
    environmentVariables,
    secrets,
  };
}

function mapToArray(map: Map<string, Env>): Env[] {
  return Array.from(map.values());
}

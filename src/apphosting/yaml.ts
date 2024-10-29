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
 * AppHostingYamlConfig is an object representing an Apphosting Yaml configuration
 * present in the user's codebase (i.e 'apphosting.yaml', 'apphosting.staging.yaml', etc).
 *
 * This class is used to abstract away the parsing and handling logic of these
 * yaml files.
 */
export class AppHostingYamlConfig {
  _loadedAppHostingYaml: Config;
  private _environmentVariables: Map<string, EnvironmentVariable>;
  private _secrets: Map<string, Secret>;

  static async loadFromFile(filePath: string): Promise<AppHostingYamlConfig> {
    const config = new AppHostingYamlConfig();
    if (!fileExistsSync(filePath)) {
      throw new FirebaseError("Cannot load AppHostingYamlConfig from given path, it doesn't exist");
    }

    const file = await readFileFromDirectory(dirname(filePath), basename(filePath));
    config._loadedAppHostingYaml = (await wrappedSafeLoad(file.source)) ?? {};

    if (config._loadedAppHostingYaml.env) {
      const parsedEnvs = config.parseEnv(config._loadedAppHostingYaml.env);
      config._environmentVariables = parsedEnvs.environmentVariables;
      config._secrets = parsedEnvs.secrets;
    }

    return config;
  }

  static empty() {
    return new AppHostingYamlConfig();
  }

  private constructor() {
    this._loadedAppHostingYaml = {};
    this._environmentVariables = new Map();
    this._secrets = new Map();
  }

  get environmentVariables(): EnvironmentVariable[] {
    return this.mapToEnv(this._environmentVariables);
  }

  get secrets(): Secret[] {
    return this.mapToEnv(this._secrets);
  }

  addEnvironmentVariable(env: EnvironmentVariable) {
    this._environmentVariables.set(env.variable, env);
  }

  addSecret(secret: Secret) {
    this._secrets.set(secret.variable, secret);
  }

  /**
   * Merges this AppHostingYamlConfig with another config, the incoming config
   * has precedence if there are any conflicting configurations.
   * */
  merge(anotherAppHostingYamlConfig: AppHostingYamlConfig) {
    for (const [key, value] of anotherAppHostingYamlConfig._environmentVariables) {
      this._environmentVariables.set(key, value);
    }

    for (const [key, value] of anotherAppHostingYamlConfig._secrets) {
      this._secrets.set(key, value);
    }
  }

  writeToFile(customFilePath: string) {
    const yamlConfigToWrite = this._loadedAppHostingYaml;
    yamlConfigToWrite.env = [
      ...this.mapToEnv(this._environmentVariables),
      ...this.mapToEnv(this._secrets),
    ];

    store(customFilePath, yaml.parseDocument(jsYaml.dump(yamlConfigToWrite)));
  }

  private mapToEnv(map: Map<string, Env>): Env[] {
    return Array.from(map.values());
  }

  private parseEnv(envs: Env[]) {
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
}

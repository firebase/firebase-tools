import { basename, dirname } from "path";
import { readFileFromDirectory, wrappedSafeLoad } from "../utils";
import { Config, Env, store } from "./config";
import * as yaml from "yaml";
import * as jsYaml from "js-yaml";
import { fileExistsSync } from "../fsutils";

export type EnvironmentVariable = Omit<Env, "secret">;
export type Secret = Omit<Env, "availability" | "value">;

export class AppHostingYamlConfig {
  filePath?: string;
  _loadedAppHostingYaml: Config;
  private _environmentVariables: Map<string, EnvironmentVariable>;
  private _secrets: Map<string, Secret>;

  constructor(filePath?: string) {
    this.filePath = filePath;
    this._loadedAppHostingYaml = {};
    this._environmentVariables = new Map();
    this._secrets = new Map();
  }

  async init() {
    // If the file doesn't exist don't load it in, instead it will be used to write to later

    if (this.filePath && fileExistsSync(this.filePath)) {
      const file = await readFileFromDirectory(dirname(this.filePath), basename(this.filePath));
      this._loadedAppHostingYaml = (await wrappedSafeLoad(file.source)) ?? {};

      if (this._loadedAppHostingYaml.env) {
        const parsedEnvs = this.parseEnv(this._loadedAppHostingYaml.env);
        this._environmentVariables = parsedEnvs.environmentVariables;
        this._secrets = parsedEnvs.secrets;
      }
    }
  }

  get environmentVariables(): EnvironmentVariable[] {
    return this.mapToEnv(this._environmentVariables);
  }

  get secrets(): Secret[] {
    return this.mapToEnv(this._secrets);
  }

  environmentVariablesAsRecord(): Record<string, string> {
    const newObject: Record<string, string> = {};
    for (const [key, env] of this._environmentVariables) {
      newObject[key] = env.value!;
    }
    return newObject;
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

  writeToFile(customFilePath?: string) {
    if (!this.filePath && !customFilePath) {
      throw Error("No apphosting yaml file path provided to write to");
    }

    const pathToWrite = customFilePath ?? this.filePath;

    const yamlConfigToWrite = this._loadedAppHostingYaml;
    yamlConfigToWrite.env = [
      ...this.mapToEnv(this._environmentVariables),
      ...this.mapToEnv(this._secrets),
    ];

    store(pathToWrite!, yaml.parseDocument(jsYaml.dump(yamlConfigToWrite)));
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

/**
 * Helper function to load and initialize an AppHostingYamlConfig object
 */
export async function loadAppHostingYaml(filePath?: string): Promise<AppHostingYamlConfig> {
  const apphostingConfig = new AppHostingYamlConfig(filePath);
  await apphostingConfig.init();

  return apphostingConfig;
}

import { basename, dirname } from "path";
import { readFileFromDirectory, wrappedSafeLoad } from "../utils";
import { Config, Env, store } from "./config";
import * as yaml from "yaml";
import * as jsYaml from "js-yaml";
import * as path from "path";
import { fileExistsSync } from "../fsutils";
import { FirebaseError } from "../error";

export type Secret = Omit<Env, "value">;
export type EnvMap = Record<string, Omit<Env, "variable">>;

/**
 * AppHostingYamlConfig is an object representing an apphosting.yaml configuration
 * present in the user's codebase (i.e 'apphosting.yaml', 'apphosting.staging.yaml', etc).
 */
export class AppHostingYamlConfig {
  // Holds the basename of the file (e.g. apphosting.yaml vs apphosting.staging.yaml)
  public filename: string | undefined;
  public env: EnvMap = {};

  /**
   * Reads in the App Hosting yaml file found in filePath, parses the secrets and
   * environment variables, and returns an object that makes it easier to
   * programatically read or manipulate the App Hosting config.
   */
  static async loadFromFile(filePath: string): Promise<AppHostingYamlConfig> {
    if (!fileExistsSync(filePath)) {
      throw new FirebaseError(`Cannot load ${filePath} from given path, it doesn't exist`);
    }
    const config = new AppHostingYamlConfig();

    const file = await readFileFromDirectory(dirname(filePath), basename(filePath));
    config.filename = path.basename(filePath);
    const loadedAppHostingYaml = (await wrappedSafeLoad(file.source)) ?? {};

    if (loadedAppHostingYaml.env) {
      config.env = toEnvMap(loadedAppHostingYaml.env);
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

  /**
   * Merges this AppHostingYamlConfig with another config, the incoming config
   * has precedence if there are any conflicting configurations.
   * */
  merge(other: AppHostingYamlConfig, allowSecretsToBecomePlaintext: boolean = true) {
    if (!allowSecretsToBecomePlaintext) {
      const wereSecrets = Object.entries(this.env)
        .filter(([, env]) => env.secret)
        .map(([key]) => key);
      if (wereSecrets.some((key) => other.env[key]?.value)) {
        throw new FirebaseError(
          `Cannot convert secret to plaintext in ${other.filename ?? "apphosting yaml"}`,
        );
      }
    }

    this.env = {
      ...this.env,
      ...other.env,
    };
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

    yamlConfigToWrite.env = toEnvList(this.env);

    store(filePath, yaml.parseDocument(jsYaml.dump(yamlConfigToWrite)));
  }
}

// TODO: generalize into a utility function and remove the key from the array type.
export function toEnvMap(envs: Env[]): EnvMap {
  return Object.fromEntries(
    envs.map((env) => {
      const variable = env.variable;
      const tmp = { ...env };
      delete (env as any).variable;
      return [variable, tmp];
    }),
  );
}

export function toEnvList(envs: EnvMap): Env[] {
  return Object.entries(envs).map(([variable, env]) => {
    return { ...env, variable };
  });
}

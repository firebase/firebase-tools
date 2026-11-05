import { FirebaseError, isObject } from "../../error";
import { writeUserEnvs } from "../env";

export type KitEnvValue = string | number | boolean | string[] | Record<string, unknown>;

export interface KitInstanceEnvSeed {
  projectId: string;
  projectAlias?: string;
  envs: Record<string, KitEnvValue>;
}

export interface SeedKitEnvOptions {
  configDir: string;
  functionsSource: string;
  projectDir: string;
  projectId: string;
  projectAlias?: string;
  envs?: Record<string, KitEnvValue>;
}

/**
 * Seeds a key-value map into the instance's .env.<project-id> configuration directory.
 */
export function seedKitInstanceEnv(opts: SeedKitEnvOptions): void {
  if (!opts.envs || Object.keys(opts.envs).length === 0) {
    return;
  }
  if (!opts.projectId) {
    throw new FirebaseError(
      "A project ID is required to seed environment variables for a kit instance.",
    );
  }

  const normalizedEnvs: Record<string, string> = {};
  for (const [key, value] of Object.entries(opts.envs)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      normalizedEnvs[key] = value.join(",");
    } else if (isObject(value)) {
      normalizedEnvs[key] = JSON.stringify(value);
    } else {
      normalizedEnvs[key] = String(value);
    }
  }

  if (Object.keys(normalizedEnvs).length === 0) {
    return;
  }

  writeUserEnvs(normalizedEnvs, {
    configDir: opts.configDir,
    functionsSource: opts.functionsSource,
    projectDir: opts.projectDir,
    projectId: opts.projectId,
    projectAlias: opts.projectAlias,
  });
}

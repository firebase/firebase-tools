import * as fs from "fs";
import * as path from "path";

import * as clc from "cli-color";
import { flatten } from "flat";

import * as env from "../functions/env";
import * as functionsConfig from "../functionsConfig";
import { Command } from "../command";
import { FirebaseError } from "../error";
import { testIamPermissions } from "../gcp/iam";
import { logBullet, logWarning, logSuccess } from "../utils";
import { promptOnce } from "../prompt";
import { loadRC } from "../rc";
import { requirePermissions } from "../requirePermissions";
import { getProjectId } from "../projectUtils";

const REQUIRED_PERMISSIONS = [
  "runtimeconfig.configs.list",
  "runtimeconfig.configs.get",
  "runtimeconfig.variables.list",
  "runtimeconfig.variables.get",
];

interface TargetProject {
  projectId: string;
  alias?: string;
}

interface EnvMap {
  origKey: string;
  newKey: string;
  value: string;
  err?: string;
}

interface ConfigToEnvResult {
  success: EnvMap[];
  errors: Required<EnvMap>[];
}

/**
 *
 */
export function convertKey(configKey: string, prefix: string): string {
  /* prettier-ignore */
  const baseKey = configKey
      .toUpperCase()       // 1. Uppercase all characters (e.g. SOME-SERVICE.KEY)
      .replace(/\./g, "_") // 2. Dots to underscores (e.g. SOME-SERVICE_KEY)
      .replace(/-/g, "_"); // 3. Dashses to underscores (e.g. SOME_SERVICE_KEY)

  let envKey = baseKey;
  try {
    env.validateKey(envKey);
  } catch (err) {
    if (err instanceof env.KeyValidationError) {
      envKey = prefix + envKey;
      env.validateKey(envKey);
    }
  }
  return envKey;
}

/**
 * Convert runtime config keys to environment variable keys.
 * e.g. someservice.key => SOMESERVICE_KEY
 * If the conversion cannot be made, collect errors.
 *
 * @param {string}
 * @return {ConfigToEnvResult} Collection of successful and errored conversion.
 */
export function configToEnv(configs: Record<string, any>, prefix: string): ConfigToEnvResult {
  const success = [];
  const errors = [];

  for (const [configKey, value] of Object.entries(flatten(configs))) {
    try {
      const envKey = convertKey(configKey, prefix);
      success.push({ origKey: configKey, newKey: envKey, value: value as string });
    } catch (err) {
      if (err instanceof env.KeyValidationError) {
        errors.push({
          origKey: configKey,
          newKey: err.key,
          err: err.message,
          value: value as string,
        });
      } else {
        throw new FirebaseError("Unexpected error while converting config", {
          exit: 2,
          original: err,
        });
      }
    }
  }
  return { success, errors };
}

// Find all projects (and its alias) associated with the current directory.
function getAllProjects(options: {
  project?: string;
  projectId?: string;
  cwd?: string;
}): TargetProject[] {
  const results: Record<string, string> = {};

  const projectId = getProjectId(options);
  if (projectId) {
    results[projectId] = projectId;
  }

  const rc = loadRC(options);
  if (rc.projects) {
    for (const [alias, projectId] of Object.entries(rc.projects)) {
      if (alias === "default") {
        if (Object.keys(results).includes(projectId)) {
          // We already have a better alias for this project.
          continue;
        }
        results[projectId] = projectId;
        continue;
      }
      results[projectId] = alias;
    }
  }
  return Object.entries(results).map(([k, v]) => ({ projectId: k, alias: v }));
}

// Check necessary IAM permissions for a projects.
// If permission check fails on a project, user must explicitly exclude it.
async function checkRequiredPermission(projectId: string): Promise<boolean> {
  const result = await testIamPermissions(projectId, REQUIRED_PERMISSIONS);
  if (result.passed) return true;

  logWarning(
    "You are missing the following permissions to read functions config on project " +
      `${clc.bold(projectId)}:\n ${result.missing.join("\n ")}`
  );

  const confirm = await promptOnce(
    {
      type: "confirm",
      name: "skip",
      default: false,
      message: `Continue without importing configs from project ${projectId}?`,
    },
    // Explicitly ignore non-interactive flag. This command NEEDS to be interactive.
    { nonInteractive: false }
  );

  if (!confirm) {
    throw new FirebaseError("Command aborted!");
  }

  return false;
}

async function promptForPrefix(
  conversions: {
    project: TargetProject;
    configToEnvResult: ConfigToEnvResult;
  }[]
): Promise<string> {
  logWarning("The following configs keys could not be exported as environment variables:\n");

  for (const { project, configToEnvResult } of conversions) {
    if (configToEnvResult.errors.length == 0) {
      continue;
    }
    logWarning(
      `${project.projectId}:\n` +
        configToEnvResult.errors
          .map((err) => `\t${err.origKey} => ${clc.bold(err.newKey)} (${err.err})`)
          .join("\n") +
        "\n"
    );
  }

  return await promptOnce(
    {
      type: "input",
      name: "prefix",
      default: "CONFIG_",
      message: "Enter a PREFIX to rename invalid environment variable keys:",
    },
    { nonInteractive: false }
  );
}

function escape(s: string): string {
  // Escape newlines and tabs
  let result = s
    .replace("\n", "\\n")
    .replace("\r", "\\r")
    .replace("\t", "\\t")
    .replace("\v", "\\v");
  // Escape other escape characters like ' and ".
  result = result.replace(/(['"])/g, "\\$1");
  return result;
}

function toDotenvFormat(envs: EnvMap[]): string {
  const lines = envs.map(({ newKey, value }) => `${newKey}="${escape(value)}"`);
  const maxLineLen = Math.max(...lines.map((l) => l.length));
  return lines
    .map((line, idx) => `${line.padEnd(maxLineLen)} # from ${envs[idx].origKey}`)
    .join("\n");
}

export default new Command("functions:config:export")
  .description("Export environment config as environment variables in dotenv format")
  .before(requirePermissions, [
    "runtimeconfig.configs.list",
    "runtimeconfig.configs.get",
    "runtimeconfig.variables.list",
    "runtimeconfig.variables.get",
  ])
  .action(async (options: any) => {
    const allProjects = getAllProjects(options);

    if (allProjects.length == 0) {
      throw new FirebaseError(
        "Didn't find any project in the current directory. " +
          "Are you in a firebase project directory?"
      );
    }

    const projects = allProjects.filter(
      async ({ projectId }) => await checkRequiredPermission(projectId)
    );

    // TODO: Check for reserved alias

    logBullet(
      "Importing functions configs from projects [" +
        projects.map(({ projectId }) => `${clc.bold(projectId)}`).join(", ") +
        "]"
    );

    let prefix = "";
    let results = [];
    while (true) {
      results = await Promise.all(
        projects.map(async (project) => {
          const configs = await functionsConfig.materializeAll(project.projectId);
          return { project, configToEnvResult: configToEnv(configs, prefix) };
        })
      );
      if (results.every((result) => result.configToEnvResult.errors.length == 0)) {
        break;
      }
      prefix = await promptForPrefix(results);
    }

    const dotenvs = results.map(({ project, configToEnvResult }) => {
      const dotenv = toDotenvFormat(configToEnvResult.success);
      return { project, dotenv };
    });

    // TODO: collect common envs

    let msg = "Wrote files:\n";
    const basePath: string = options.config.get("functions.source", ".");
    for (const { project, dotenv } of dotenvs) {
      const filePath = path.join(basePath, `.env.${project.alias ?? project.projectId}`);
      fs.writeFileSync(filePath, dotenv);
      msg += `\t${filePath}\t\t#  Environment variables for project '${project.projectId}'\n`;
    }
    logSuccess(msg);
  });

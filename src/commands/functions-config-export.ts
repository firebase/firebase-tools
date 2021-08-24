import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import * as clc from "cli-color";

import * as configExport from "../functions/runtimeConfigExport";
import * as functionsConfig from "../functionsConfig";
import * as requireConfig from "../requireConfig";
import { Command } from "../command";
import { FirebaseError } from "../error";
import { testIamPermissions } from "../gcp/iam";
import { logger } from "../logger";
import { resolveProjectPath } from "../projectPath";
import { getProjectId } from "../projectUtils";
import { promptOnce } from "../prompt";
import { loadRC } from "../rc";
import { requirePermissions } from "../requirePermissions";
import { logBullet, logWarning, logSuccess } from "../utils";

const REQUIRED_PERMISSIONS = [
  "runtimeconfig.configs.list",
  "runtimeconfig.configs.get",
  "runtimeconfig.variables.list",
  "runtimeconfig.variables.get",
];

const RESERVED_PROJECT_ALIAS = ["local"];

interface ProjectAliasInfo {
  projectId: string;
  alias?: string;
}

/**
 * Find all projects (and its alias) associated with the current directory.
 */
export function getAllProjectInfos(options: {
  project?: string;
  projectId?: string;
  cwd?: string;
}): ProjectAliasInfo[] {
  const result: Record<string, string> = {};

  const rc = loadRC(options);
  if (rc.projects) {
    for (const [alias, projectId] of Object.entries(rc.projects)) {
      if (Object.keys(result).includes(projectId)) {
        logWarning(
          `Multiple aliases found for ${clc.bold(projectId)}. ` +
            `Preferring alias (${clc.bold(result[projectId])}) over (${clc.bold(alias)}).`
        );
        continue;
      }
      result[projectId] = alias;
    }
  }

  const projectId = getProjectId(options);
  if (projectId && !Object.keys(result).includes(projectId)) {
    result[projectId] = projectId;
  }

  return Object.entries(result).map(([k, v]) => {
    const result: ProjectAliasInfo = { projectId: k };
    if (k !== v) {
      result.alias = v;
    }
    return result;
  });
}

// Check necessary IAM permissions for a project.
// If permission check fails on a project, ask user to exclude it.
async function checkRequiredPermission({ projectId }: ProjectAliasInfo): Promise<boolean> {
  const result = await testIamPermissions(projectId, REQUIRED_PERMISSIONS);
  if (result.passed) return true;

  logWarning(
    "You are missing the following permissions to read functions config on project " +
      `\t${clc.bold(projectId)}:\n ${result.missing.join("\n ")}`
  );

  const confirm = await promptOnce(
    {
      type: "confirm",
      name: "skip",
      default: true,
      message: `Continue without importing configs from project ${projectId}?`,
    },
    {}
  );

  if (!confirm) {
    throw new FirebaseError("Command aborted!");
  }

  return false;
}

function configsToEnvs(
  projects: ProjectAliasInfo[],
  configs: Record<string, unknown>[],
  prefix: string
): { envs: configExport.EnvMap[][]; errMsg: string } {
  const results = configs.map((config) => configExport.configToEnv(config, prefix));

  const errMsg = results
    .map(({ errors }, idx) => ({ project: projects[idx], errors }))
    .filter(({ errors }) => errors.length > 0)
    .map(
      ({ project, errors }) =>
        `${project.alias ?? project.projectId}:\n` +
        errors.map((err) => `\t${err.origKey} => ${clc.bold(err.newKey)} (${err.err})`).join("\n") +
        "\n"
    )
    .join("\n");
  return {
    envs: results.map((result) => result.success),
    errMsg,
  };
}

async function promptForPrefix(errMsg: string): Promise<string> {
  logWarning("The following configs keys could not be exported as environment variables:\n");
  logWarning(errMsg);
  return await promptOnce(
    {
      type: "input",
      name: "prefix",
      default: "CONFIG_",
      message: "Enter a PREFIX to rename invalid environment variable keys:",
    },
    {}
  );
}

function writeEnvs(
  basePath: string,
  header: string,
  projects: ProjectAliasInfo[],
  envs: configExport.EnvMap[][]
): string[] {
  return envs.map((env, idx) => {
    const project = projects[idx];
    const dotenv = configExport.toDotenvFormat(env, header);
    const ext = project.alias ?? project.projectId;
    const filePath = path.join(basePath, `.env.${ext}`);

    fs.writeFileSync(filePath, dotenv);
    return filePath;
  });
}

function writeEmptyEnvs(basePath: string, header: string, projects: ProjectAliasInfo[]): string[] {
  return writeEnvs(
    basePath,
    header,
    projects,
    projects.map(() => [])
  );
}

async function copyFilesToDir(srcFiles: string[], destDir: string): Promise<string[]> {
  const destFiles = [];
  for (const file of srcFiles) {
    const targetFile = path.join(destDir, path.basename(file));
    if (fs.existsSync(targetFile)) {
      const overwrite = await promptOnce(
        {
          type: "confirm",
          name: "overwrite",
          default: false,
          message: `${targetFile} already exists. Overwrite file?`,
        },
        {}
      );
      if (!overwrite) {
        logBullet(`Skipping ${targetFile}`);
        continue;
      }
    }
    fs.copyFileSync(file, targetFile);
    destFiles.push(targetFile);
  }
  return destFiles.filter((f) => f.length > 0);
}

export default new Command("functions:config:export")
  .description("Export environment config as environment variables in dotenv format")
  .before(requirePermissions, [
    "runtimeconfig.configs.list",
    "runtimeconfig.configs.get",
    "runtimeconfig.variables.list",
    "runtimeconfig.variables.get",
  ])
  .before(requireConfig)
  .action(async (options: any) => {
    const allProjectInfos = getAllProjectInfos(options);

    const projectInfos: ProjectAliasInfo[] = [];
    for (const projectInfo of allProjectInfos) {
      if (await checkRequiredPermission(projectInfo)) {
        if (projectInfo.alias && RESERVED_PROJECT_ALIAS.includes(projectInfo.alias)) {
          logWarning(
            `Project alias (${clc.bold(projectInfo.alias)}) is reserved for internal use. ` +
              `Saving exported config in .env.${projectInfo.projectId} instead.`
          );
          delete projectInfo.alias;
        }
        projectInfos.push(projectInfo);
      }
    }

    logBullet(
      "Importing functions configs from projects [" +
        projectInfos.map(({ projectId }) => `${clc.bold(projectId)}`).join(", ") +
        "]"
    );

    const configs = await Promise.all(
      projectInfos.map(async ({ projectId }) => {
        return await functionsConfig.materializeAll(projectId);
      })
    );
    logger.debug("Loaded function configs: " + JSON.stringify(configs));

    let prefix = "";
    let envs = [];
    while (true) {
      const result = configsToEnvs(projectInfos, configs, prefix);
      envs = result.envs;

      if (result.errMsg.length == 0) {
        break;
      }
      prefix = await promptForPrefix(result.errMsg);

      envs = [];
    }

    const header = `# Exported firebase functions:config:export command on ${new Date().toLocaleDateString()}`;
    const tmpdir = fs.mkdtempSync(os.tmpdir() + "dotenvs");
    const tmpFiles = writeEnvs(tmpdir, header, projectInfos, envs);
    tmpFiles.push(...writeEmptyEnvs(tmpdir, header, [{ projectId: "" }, { projectId: "local" }]));
    logger.debug(`Wrote tmp .env files: [${tmpFiles.join(",")}]`);

    const functionsDir = resolveProjectPath(options, options.config.get("functions.source", "."));
    const files = await copyFilesToDir(tmpFiles, functionsDir);
    logSuccess(
      "Wrote files:\n" +
        files
          .filter((f) => f.length > 0)
          .map((f) => `\t${f}`)
          .join("\n")
    );
  });

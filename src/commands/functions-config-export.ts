import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import * as clc from "cli-color";

import * as configExport from "../functions/runtimeConfigExport";
import * as functionsConfig from "../functionsConfig";
import { Command } from "../command";
import { FirebaseError } from "../error";
import { testIamPermissions } from "../gcp/iam";
import { logger } from "../logger";
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
export function getAllProjects(options: {
  project?: string;
  projectId?: string;
  cwd?: string;
}): ProjectAliasInfo[] {
  const result: Record<string, string> = {};

  const projectId = getProjectId(options);
  if (projectId) {
    result[projectId] = projectId;
  }

  const rc = loadRC(options);
  if (rc.projects) {
    for (const [alias, projectId] of Object.entries(rc.projects)) {
      if (Object.keys(result).includes(projectId)) {
        logWarning("FOOBBARCAR");
      }
      result[projectId] = alias;
    }
  }
  return Object.entries(result).map(([k, v]) => {
    const result: ProjectAliasInfo = { projectId: k };
    result.alias = v;
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
    // Explicitly ignore non-interactive flag. This command NEEDS to be interactive.
    { nonInteractive: false }
  );

  if (!confirm) {
    throw new FirebaseError("Command aborted!");
  }

  return false;
}

// Check if project alias is reserved for internal use.
// If a project's alias is reserved, ask for user consent to exclude the project.
async function checkReservedAlias({ projectId, alias }: ProjectAliasInfo): Promise<boolean> {
  if (!alias || !RESERVED_PROJECT_ALIAS.includes(alias)) {
    return true;
  }

  logWarning(
    "The following project alias is reserved for internal use:\n" +
      `\t${projectId}: ${clc.bold(alias)}`
  );
  const suggestCmd = `firebase use --unalias ${alias}`;
  logWarning(`Please change the alias of the project by running ${clc.bold(suggestCmd)}`);

  const confirm = await promptOnce(
    {
      type: "confirm",
      name: "skip",
      default: true,
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

function configsToEnvs(
  projects: ProjectAliasInfo[],
  configs: Record<string, any>[],
  prefix: string
): { envs: configExport.EnvMap[][]; errMsg: string } {
  const results = configs.map((config) => configExport.configToEnv(config, prefix));

  const errMsg = results
    .map(({ errors }, idx) => ({ project: projects[idx], errors }))
    .filter(({ errors }) => errors.length > 0)
    .map(
      ({ project, errors }) =>
        `${project.projectId}:\n` +
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
    { nonInteractive: false }
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
    const filename = ext ? `.env.${ext}` : ".env";
    const filePath = path.join(basePath, filename);

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
          default: true,
          message: `${targetFile} already exists. Overwrite file?`,
        },
        { nonInteractive: false }
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
  .action(async (options: any) => {
    const allProjects = getAllProjects(options);

    if (allProjects.length == 0) {
      throw new FirebaseError(
        "Didn't find any project in the current directory. " +
          "Are you in a firebase project directory?"
      );
    }

    const projects: ProjectAliasInfo[] = [];
    for (const project of allProjects) {
      if ((await checkRequiredPermission(project)) && (await checkReservedAlias(project))) {
        projects.push(project);
      }
    }

    logBullet(
      "Importing functions configs from projects [" +
        projects.map(({ projectId }) => `${clc.bold(projectId)}`).join(", ") +
        "]"
    );

    const configs = await Promise.all(
      projects.map(async ({ projectId }) => {
        return await functionsConfig.materializeAll(projectId);
      })
    );
    logger.debug("Loaded function configs: " + JSON.stringify(configs));

    let prefix = "";
    let envs = [];
    while (true) {
      const result = configsToEnvs(projects, configs, prefix);
      envs = result.envs;

      if (result.errMsg.length == 0) {
        break;
      }
      prefix = await promptForPrefix(result.errMsg);

      envs = [];
    }

    const header = `# Exported firebase functions:config:export command on ${new Date().toLocaleDateString()}`;
    const tmpdir = fs.mkdtempSync(os.tmpdir() + "dotenvs");
    const tmpFiles = writeEnvs(tmpdir, header, projects, envs);
    tmpFiles.push(...writeEmptyEnvs(tmpdir, header, [{ projectId: "" }, { projectId: "local" }]));
    logger.debug(`Wrote tmp .env files: [${tmpFiles.join(",")}]`);

    const functionsDir: string = options.config.get("functions.source", ".");
    const files = await copyFilesToDir(tmpFiles, functionsDir);
    logSuccess(
      "Wrote files:\n" +
        files
          .filter((f) => f.length > 0)
          .map((f) => `\t${f}`)
          .join("\n")
    );
  });

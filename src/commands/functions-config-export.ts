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

interface ProjectConfigInfo {
  projectId: string;
  alias?: string;
  config?: Record<string, unknown>;
  envs?: configExport.EnvMap[];
}

/**
 * Find all projects (and its alias) associated with the current directory.
 */
export function getProjectInfos(options: {
  project?: string;
  projectId?: string;
  cwd?: string;
}): ProjectConfigInfo[] {
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
    const result: ProjectConfigInfo = { projectId: k };
    if (k !== v) {
      result.alias = v;
    }
    return result;
  });
}

async function checkRequiredPermission({ projectId }: ProjectConfigInfo): Promise<boolean> {
  const result = await testIamPermissions(projectId, REQUIRED_PERMISSIONS);
  if (result.passed) return true;

  logWarning(
    "You are missing the following permissions to read functions config on project " +
      `${clc.bold(projectId)}:\n\t${result.missing.join("\n\t")}`
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
  projects: ProjectConfigInfo[],
  prefix: string
): { projects: ProjectConfigInfo[]; errMsg: string } {
  const results = [];
  let errMsg = "";
  for (const project of projects) {
    const result = configExport.configToEnv(project.config!, prefix);
    if (result.errors.length > 0) {
      const msg =
        `${project.alias ?? project.projectId}:\n` +
        result.errors
          .map((err) => `\t${err.origKey} => ${clc.bold(err.newKey)} (${err.err})`)
          .join("\n") +
        "\n";
      errMsg += msg;
    } else {
      results.push({ ...project, envs: result.success });
    }
    projects.map((project) => configExport.configToEnv(project.config!, prefix));
  }
  return {
    projects: results,
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

function writeEnvs(basePath: string, header: string, projects: ProjectConfigInfo[]): string[] {
  return projects.map((project) => {
    const dotenv = configExport.toDotenvFormat(project.envs ?? [], header);
    const ext = project.alias ?? project.projectId;
    const filename = ext ? `.env.${ext}` : `.env`; // ext will be empty when writing empty .env.
    const filePath = path.join(basePath, filename);

    fs.writeFileSync(filePath, dotenv);
    return filePath;
  });
}

function writeEmptyEnvs(basePath: string, header: string, projects: ProjectConfigInfo[]): string[] {
  return writeEnvs(basePath, header, projects);
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
    const pInfosWithAlias = getProjectInfos(options);

    for (const pInfo of pInfosWithAlias) {
      if (pInfo.alias && RESERVED_PROJECT_ALIAS.includes(pInfo.alias)) {
        logWarning(
          `Project alias (${clc.bold(pInfo.alias)}) is reserved for internal use. ` +
            `Saving exported config in .env.${pInfo.projectId} instead.`
        );
        delete pInfo.alias;
      }
    }

    logBullet(
      "Importing functions configs from projects [" +
        pInfosWithAlias.map(({ projectId }) => `${clc.bold(projectId)}`).join(", ") +
        "]"
    );

    const pInfosWithConfigs: ProjectConfigInfo[] = [];
    for (const pInfo of pInfosWithAlias) {
      try {
        const config = await functionsConfig.materializeAll(pInfo.projectId);
        pInfosWithConfigs.push({ ...pInfo, config });
      } catch (err) {
        if (err.status === 403) {
          await checkRequiredPermission(pInfo);
          continue;
        }
        throw err;
      }
    }

    logger.debug("Loaded function configs: " + JSON.stringify(pInfosWithConfigs));

    let prefix = "";
    let pInfosWithEnvs = [];
    while (true) {
      const { projects, errMsg } = configsToEnvs(pInfosWithConfigs, prefix);
      pInfosWithEnvs = projects;

      if (errMsg.length == 0) {
        break;
      }
      prefix = await promptForPrefix(errMsg);

      pInfosWithEnvs = [];
    }

    const header = `# Exported firebase functions:config:export command on ${new Date().toLocaleDateString()}`;
    const tmpdir = fs.mkdtempSync(os.tmpdir() + "dotenvs");
    const tmpFiles = writeEnvs(tmpdir, header, pInfosWithEnvs);
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

import * as clc from "colorette";

import { Command } from "../command";
import { getProject, listFirebaseProjects, ProjectInfo } from "../management/projects";
import { updateStudioFirebaseProject } from "../management/studio";
import { logger } from "../logger";
import { Options } from "../options";
import { input, select } from "../prompt";
import { requireAuth } from "../requireAuth";
import { validateProjectId } from "../command";
import * as utils from "../utils";
import { FirebaseError } from "../error";
import { RC } from "../rc";
import { isFirebaseStudio } from "../env";

function listAliases(options: Options) {
  if (options.rc.hasProjects) {
    logger.info("Project aliases for", clc.bold(options.projectRoot || "") + ":");
    logger.info();
    for (const [alias, projectId] of Object.entries(options.rc.projects)) {
      const listing = alias + " (" + projectId + ")";
      if (options.project === projectId || options.projectAlias === alias) {
        logger.info(clc.cyan(clc.bold("* " + listing)));
      } else {
        logger.info("  " + listing);
      }
    }
    logger.info();
  }
  logger.info("Run", clc.bold("firebase use --add"), "to define a new project alias.");
}

function verifyMessage(name: string): string {
  return "please verify project " + clc.bold(name) + " exists and you have access.";
}

// firebase use [alias_or_project]
export async function setNewActive(
  projectOrAlias: string,
  aliasOpt: string | undefined,
  rc: RC,
  projectRoot: string,
) {
  let project: ProjectInfo | undefined;
  const hasAlias = rc.hasProjectAlias(projectOrAlias);
  const resolvedProject = rc.resolveAlias(projectOrAlias);
  validateProjectId(resolvedProject);
  try {
    project = await getProject(resolvedProject);
  } catch {
    throw new FirebaseError("Invalid project selection, " + verifyMessage(projectOrAlias));
  }

  // Only update if running in Firebase Studio
  if (isFirebaseStudio()) {
    await updateStudioFirebaseProject(resolvedProject);
  }

  if (aliasOpt) {
    // firebase use [project] --alias [alias]
    if (!project) {
      throw new FirebaseError(
        `Cannot create alias ${clc.bold(aliasOpt)}, ${verifyMessage(projectOrAlias)}`,
      );
    }
    rc.addProjectAlias(aliasOpt, projectOrAlias);
    logger.info("Created alias", clc.bold(aliasOpt), "for", resolvedProject + ".");
  }

  if (hasAlias) {
    // found alias
    if (!project) {
      // found alias, but not in project list
      throw new FirebaseError(
        `Unable to use alias ${clc.bold(projectOrAlias)}, ${verifyMessage(resolvedProject)}`,
      );
    }

    utils.makeActiveProject(projectRoot, projectOrAlias);
    logger.info("Now using alias", clc.bold(projectOrAlias), "(" + resolvedProject + ")");
  } else if (project) {
    // exact project id specified
    utils.makeActiveProject(projectRoot, projectOrAlias);
    logger.info("Now using project", clc.bold(projectOrAlias));
  } else {
    // no alias or project recognized
    throw new FirebaseError(`Invalid project selection, ${verifyMessage(projectOrAlias)}`);
  }
}

// firebase use --unalias [alias]
function unalias(alias: string, options: UseOptions) {
  if (options.rc.hasProjectAlias(alias)) {
    options.rc.removeProjectAlias(alias);
    logger.info("Removed alias", clc.bold(alias));
    logger.info();
    listAliases(options);
  }
}

// firebase use --add
async function addAlias(options: UseOptions) {
  if (options.nonInteractive) {
    return utils.reject(
      "Cannot run " +
        clc.bold("firebase use --add") +
        " in non-interactive mode. Use " +
        clc.bold("firebase use <project_id> --alias <alias>") +
        " instead.",
    );
  }
  const projects = await listFirebaseProjects();
  const project = await select<string>({
    message: "Which project do you want to add?",
    choices: projects.map((p) => p.projectId).sort(),
  });
  const alias = await input({
    message: "What alias do you want to use for this project? (e.g. staging)",
    validate: (input) => {
      return input && input.length > 0;
    },
  });
  const results: { project: string; alias: string } = {
    project,
    alias,
  };
  options.rc.addProjectAlias(alias, project);
  utils.makeActiveProject(options.projectRoot!, results.alias);
  logger.info();
  logger.info("Created alias", clc.bold(results.alias || ""), "for", results.project + ".");
  logger.info("Now using alias", clc.bold(results.alias || "") + " (" + results.project + ")");
}

// firebase use --clear
function clearAlias(options: UseOptions) {
  utils.makeActiveProject(options.projectRoot!, undefined);
  delete options.projectAlias;
  delete options.project;
  logger.info("Cleared active project.");
  logger.info();
  listAliases(options);
}

// firebase use
async function genericUse(options: UseOptions) {
  if (options.nonInteractive || !process.stdout.isTTY) {
    if (options.project) {
      logger.info(options.project);
      return options.project;
    }
    return utils.reject("No active project");
  }

  if (options.projectAlias) {
    logger.info(
      "Active Project:",
      clc.bold(clc.cyan(options.projectAlias + " (" + options.project + ")")),
    );
  } else if (options.project) {
    logger.info("Active Project:", clc.bold(clc.cyan(options.project)));
  } else {
    let msg = "No project is currently active";
    if (options.rc.hasProjects) {
      msg += ", and no aliases have been created.";
    }
    logger.info(msg + ".");
  }
  logger.info();
  listAliases(options);
  return options.project;
}

type UseOptions = Options & { alias?: string; unalias?: string; add?: boolean; clear?: boolean };
export const command = new Command("use [alias_or_project_id]")
  .description("set an active Firebase project for your working directory")
  .option("--add", "create a new project alias interactively")
  .option("--alias <name>", "create a new alias for the provided project id")
  .option("--unalias <name>", "remove an already created project alias")
  .option("--clear", "clear the active project selection")
  .before(requireAuth)
  .action((newActive, options: UseOptions) => {
    // HACK: Commander.js silently swallows an option called alias >_<
    let aliasOpt: string | undefined;
    const i = process.argv.indexOf("--alias");
    if (i >= 0 && process.argv.length > i + 1) {
      aliasOpt = process.argv[i + 1];
    }

    if (!options.projectRoot) {
      // not in project directory
      return utils.reject(
        clc.bold("firebase use") +
          " must be run from a Firebase project directory.\n\nRun " +
          clc.bold("firebase init") +
          " to start a project directory in the current folder.",
      );
    }

    if (newActive) {
      return setNewActive(newActive, aliasOpt, options.rc, options.projectRoot);
    }
    if (options.unalias) {
      return unalias(options.unalias, options);
    }
    if (options.add) {
      return addAlias(options);
    }
    if (options.clear) {
      return clearAlias(options);
    }
    return genericUse(options);
  });

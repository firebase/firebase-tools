import * as clc from "colorette";

import { Command } from "../command";
import { listFirebaseProjects, getFirebaseProject } from "../management/projects";
import { FirebaseProjectMetadata } from "../types/project";
import { logger } from "../logger";
import { Options } from "../options";
import { prompt } from "../prompt";
import { requireAuth } from "../requireAuth";
import { validateProjectId } from "../command";
import { FirebaseError } from "../error";
import { makeActiveProject } from "../utils";
import { Constants } from "../emulator/constants";

type UseOptions = Options & {
  add: boolean;
  alias: string;
  unalias: string;
  clear: boolean;
};

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

export const command = new Command("use [alias_or_project_id]")
  .description("set an active Firebase project for your working directory")
  .option("--add", "create a new project alias interactively")
  .option("--alias <name>", "create a new alias for the provided project id")
  .option("--unalias <name>", "remove an already created project alias")
  .option("--clear", "clear the active project selection")
  .action(async (newActive: string, options: UseOptions) => {
    // HACK: Commander.js silently swallows an option called alias >_<
    let aliasOpt: string | undefined;
    const i = process.argv.indexOf("--alias");
    if (i >= 0 && process.argv.length > i + 1) {
      aliasOpt = process.argv[i + 1];
    }

    if (!options.projectRoot) {
      // not in project directory
      throw new FirebaseError(
        clc.bold("firebase use") +
          " must be run from a Firebase project directory.\n\nRun " +
          clc.bold("firebase init") +
          " to start a project directory in the current folder.",
      );
    }

    if (newActive) {
      // firebase use [alias_or_project]
      let project: FirebaseProjectMetadata | undefined;
      const hasAlias = options.rc.hasProjectAlias(newActive);
      const resolvedProject = options.rc.resolveAlias(newActive);
      validateProjectId(resolvedProject);
      if (!Constants.isDemoProject(resolvedProject)) {
        project = await getFirebaseProject(resolvedProject);
      }
      if (aliasOpt) {
        // firebase use [project] --alias [alias]
        if (!project && !Constants.isDemoProject(resolvedProject)) {
          throw new FirebaseError(
            "Cannot create alias " + clc.bold(aliasOpt) + ", " + verifyMessage(newActive),
          );
        }
        options.rc.addProjectAlias(aliasOpt, newActive);
        logger.info("Created alias", clc.bold(aliasOpt), "for", resolvedProject + ".");
      }

      if (hasAlias) {
        // found alias
        if (!project && !Constants.isDemoProject(resolvedProject)) {
          // found alias, but not in project list
          throw new FirebaseError(
            "Unable to use alias " + clc.bold(newActive) + ", " + verifyMessage(resolvedProject),
          );
        }

        makeActiveProject(options.projectRoot, newActive);
        logger.info("Now using alias", clc.bold(newActive), "(" + resolvedProject + ")");
      } else if (project) {
        // exact project id specified
        makeActiveProject(options.projectRoot, newActive);
        logger.info("Now using project", clc.bold(newActive));
      } else {
        // no alias or project recognized
        throw new FirebaseError("Invalid project selection, " + verifyMessage(newActive));
      }
    } else if (options.unalias) {
      // firebase use --unalias [alias]
      if (options.rc.hasProjectAlias(options.unalias)) {
        options.rc.removeProjectAlias(options.unalias);
        logger.info("Removed alias", clc.bold(options.unalias));
        logger.info();
        listAliases(options);
      }
    } else if (options.add) {
      // firebase use --add
      if (options.nonInteractive) {
        throw new FirebaseError(
          "Cannot run " +
            clc.bold("firebase use --add") +
            " in non-interactive mode. Use " +
            clc.bold("firebase use <project_id> --alias <alias>") +
            " instead.",
        );
      }
      await requireAuth(options);
      const projects = await listFirebaseProjects();
      const results: { project: string; alias: string } = await prompt(options, [
        {
          type: "list",
          name: "project",
          message: "Which project do you want to add?",
          choices: projects.map((p) => p.projectId).sort(),
        },
        {
          type: "input",
          name: "alias",
          message: "What alias do you want to use for this project? (e.g. staging)",
          validate: (input) => {
            return input && input.length > 0;
          },
        },
      ]);
      options.rc.addProjectAlias(results.alias, results.project);
      makeActiveProject(options.projectRoot, results.alias);
      logger.info();
      logger.info("Created alias", clc.bold(results.alias || ""), "for", results.project + ".");
      logger.info("Now using alias", clc.bold(results.alias || "") + " (" + results.project + ")");
    } else if (options.clear) {
      // firebase use --clear
      makeActiveProject(options.projectRoot, undefined);
      options.projectAlias = undefined;
      options.project = undefined;
      logger.info("Cleared active project.");
      logger.info();
      listAliases(options);
    } else {
      // firebase use
      if (options.nonInteractive || !process.stdout.isTTY) {
        if (options.project) {
          logger.info(options.project);
          return options.project;
        }
        throw new FirebaseError("No active project");
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
  });

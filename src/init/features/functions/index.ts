import * as clc from "colorette";
import * as _ from "lodash";

import { logger } from "../../../logger";
import { promptOnce } from "../../../prompt";
import { requirePermissions } from "../../../requirePermissions";
import { previews } from "../../../previews";
import { Options } from "../../../options";
import { ensure } from "../../../ensureApiEnabled";
import { Config } from "../../../config";
import { normalizeAndValidate, configForCodebase } from "../../../functions/projectConfig";

/**
 * Set up a new firebase project for functions.
 */
export async function doSetup(setup: any, config: Config, options: Options): Promise<any> {
  const projectId = setup?.rcfile?.projects?.default;
  if (projectId) {
    await requirePermissions({ ...options, project: projectId });
    await Promise.all([
      ensure(projectId, "cloudfunctions.googleapis.com", "unused", true),
      ensure(projectId, "runtimeconfig.googleapis.com", "unused", true),
    ]);
  }
  setup.functions = {};

  if (!config.src.functions) {
    // if functions have not been initialized yet
    setup.config.functions = [];
    return codebaseSetup(setup, config, false);
  } else {
    // if functions have already been initialized
    // make sure config is validated and normalized
    setup.config.functions = normalizeAndValidate(setup.config.functions);

    logger.info();
    logger.info("Detected " + clc.bold("existing codebase(s)."));
    logger.info();

    const choices = [
      {
        name: "Initialize",
        value: "new",
      },
      {
        name: "Re-initialize",
        value: "reinit",
      },
    ];
    const initOpt = await promptOnce({
      type: "list",
      message: "Would you like to initialize a new codebase, or reinitialize an existing one?",
      default: "new",
      choices,
    });
    return codebaseSetup(setup, config, initOpt === "reinit");
  }
}

/**
 *  User dialogue to set up configuration for functions codebase.
 */
async function codebaseSetup(setup: any, config: Config, reinit: boolean): Promise<any> {
  if (reinit) {
    const choices = setup.config.functions.map((cbconfig: any) => {
      return {
        name: cbconfig["codebase"],
        value: cbconfig["codebase"],
      };
    });
    const codebase = await promptOnce({
      type: "list",
      message: "Which codebase would you like to re-initialize?",
      choices,
    });
    const cbconfig = configForCodebase(setup.config.functions, codebase);
    _.set(setup, "functions.source", cbconfig.source);
    _.set(setup, "functions.codebase", cbconfig.codebase);

    logger.info("Re-initializing " + clc.bold(`codebase ${codebase}...`));
    logger.info();
  } else {
    logger.info();
    logger.info("Let's create a new codebase to contain and manage your functions.");
    logger.info("A directory corresponding to the codebase will be created in your project");
    logger.info("with sample code pre-configured.");
    logger.info();
    logger.info("See https://firebase.google.com/docs/functions/organize-functions for");
    logger.info("more information on organizing your functions using codebases.");
    logger.info();
    logger.info("Functions can be deployed with " + clc.bold("firebase deploy") + ".");
    logger.info();

    const source = await promptOnce({
      type: "input",
      message: "Where would you like to initialize your new functions source?",
      default: "functions",
    });
    const codebase = await promptOnce({
      type: "input",
      message: "What should be the name of this codebase?",
      default: source, // TODO: codebase-name-ify the dir name
    });
    setup.config.functions.push({
      source: source,
      codebase: codebase,
      ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log"],
    });
    // checks if the updated functions codebase config is valid
    // also checks if the user-specified codebase name and source are valid
    setup.config.functions = normalizeAndValidate(setup.config.functions);
    _.set(setup, "functions.source", source);
    _.set(setup, "functions.codebase", codebase);
  }

  return languageSetup(setup, config);
}

/**
 * User dialogue to set up configuration for functions codebase language choice.
 */
async function languageSetup(setup: any, config: Config): Promise<any> {
  const choices = [
    {
      name: "JavaScript",
      value: "javascript",
    },
    {
      name: "TypeScript",
      value: "typescript",
    },
  ];
  if (previews.golang) {
    choices.push({
      name: "Go",
      value: "golang",
    });
  }
  const language = await promptOnce({
    type: "list",
    message: "What language would you like to use to write Cloud Functions?",
    default: "javascript",
    choices,
  });

  return require("./" + language).setup(setup, config);
}

import * as clc from "cli-color";

import { logger } from "../../../logger";
import { promptOnce } from "../../../prompt";
import { requirePermissions } from "../../../requirePermissions";
import { previews } from "../../../previews";
import { Options } from "../../../options";
import * as ensureApiEnabled from "../../../ensureApiEnabled";

module.exports = async function (setup: any, config: any, options: Options) {
  logger.info();
  logger.info(
    "A " + clc.bold("functions") + " directory will be created in your project with sample code"
  );
  logger.info(
    "pre-configured. Functions can be deployed with " + clc.bold("firebase deploy") + "."
  );
  logger.info();

  setup.functions = {};
  const projectId = setup?.rcfile?.projects?.default;
  if (projectId) {
    await requirePermissions({ ...options, project: projectId });
    await Promise.all([
      ensureApiEnabled.enable(projectId, "cloudfunctions.googleapis.com"),
      ensureApiEnabled.enable(projectId, "runtimeconfig.googleapis.com"),
    ]);
  }
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
  return require("./" + language)(setup, config);
};

import * as clc from "colorette";
import * as fs from "fs";

import * as gcp from "../../../gcp";
import * as fsutils from "../../../fsutils";
import { prompt, promptOnce } from "../../../prompt";
import { logger } from "../../../logger";
import * as utils from "../../../utils";

const DEFAULT_RULES_FILE = "firestore.rules";

const RULES_TEMPLATE = fs.readFileSync(
  __dirname + "/../../../../templates/init/firestore/firestore.rules",
  "utf8",
);

export function initRules(setup: any, config: any): Promise<any> {
  logger.info();
  logger.info("Firestore Security Rules allow you to define how and when to allow");
  logger.info("requests. You can keep these rules in your project directory");
  logger.info("and publish them with " + clc.bold("firebase deploy") + ".");
  logger.info();

  return prompt(setup.config.firestore, [
    {
      type: "input",
      name: "rules",
      message: "What file should be used for Firestore Rules?",
      default: DEFAULT_RULES_FILE,
    },
  ])
    .then(() => {
      const filename = setup.config.firestore.rules;

      if (fsutils.fileExistsSync(filename)) {
        const msg =
          "File " +
          clc.bold(filename) +
          " already exists." +
          " Do you want to overwrite it with the Firestore Rules from the Firebase Console?";
        return promptOnce({
          type: "confirm",
          message: msg,
          default: false,
        });
      }

      return Promise.resolve(true);
    })
    .then((overwrite) => {
      if (!overwrite) {
        return Promise.resolve();
      }

      if (!setup.projectId) {
        return config.writeProjectFile(setup.config.firestore.rules, getDefaultRules());
      }

      return getRulesFromConsole(setup.projectId).then((contents: any) => {
        return config.writeProjectFile(setup.config.firestore.rules, contents);
      });
    });
}

function getDefaultRules(): string {
  const date = utils.thirtyDaysFromNow();
  const formattedForRules = `${date.getFullYear()}, ${date.getMonth() + 1}, ${date.getDate()}`;
  return RULES_TEMPLATE.replace(/{{IN_30_DAYS}}/g, formattedForRules);
}

function getRulesFromConsole(projectId: string): Promise<any> {
  return gcp.rules
    .getLatestRulesetName(projectId, "cloud.firestore")
    .then((name) => {
      if (!name) {
        logger.debug("No rulesets found, using default.");
        return [{ name: DEFAULT_RULES_FILE, content: getDefaultRules() }];
      }

      logger.debug("Found ruleset: " + name);
      return gcp.rules.getRulesetContent(name);
    })
    .then((rules: any[]) => {
      if (rules.length <= 0) {
        return utils.reject("Ruleset has no files", { exit: 1 });
      }

      if (rules.length > 1) {
        return utils.reject("Ruleset has too many files: " + rules.length, { exit: 1 });
      }

      // Even though the rules API allows for multi-file rulesets, right
      // now both the console and the CLI are built on the single-file
      // assumption.
      return rules[0].content;
    });
}

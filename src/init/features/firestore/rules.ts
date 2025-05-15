import * as clc from "colorette";

import * as gcp from "../../../gcp";
import * as fsutils from "../../../fsutils";
import { confirm, input } from "../../../prompt";
import { logger } from "../../../logger";
import * as utils from "../../../utils";
import { readTemplateSync } from "../../../templates";
import { RequiredInfo } from "./index";
import { Setup } from "../..";
import { Config } from "../../../config";

export const DEFAULT_RULES_FILE = "firestore.rules";

const RULES_TEMPLATE = readTemplateSync("init/firestore/firestore.rules");

export function getDefaultRules(): string {
  const date = utils.thirtyDaysFromNow();
  const formattedForRules = `${date.getFullYear()}, ${date.getMonth() + 1}, ${date.getDate()}`;
  return RULES_TEMPLATE.replace(/{{IN_30_DAYS}}/g, formattedForRules);
}

export async function initRules(setup: Setup, config: Config, info: RequiredInfo): Promise<any> {
  logger.info();
  logger.info("Firestore Security Rules allow you to define how and when to allow");
  logger.info("requests. You can keep these rules in your project directory");
  logger.info("and publish them with " + clc.bold("firebase deploy") + ".");
  logger.info();

  info.rulesFilename =
    info.rulesFilename ||
    (await input({
      message: "What file should be used for Firestore Rules?",
      default: DEFAULT_RULES_FILE,
    }));

  if (fsutils.fileExistsSync(info.rulesFilename)) {
    const msg =
      "File " +
      clc.bold(info.rulesFilename) +
      " already exists." +
      " Do you want to overwrite it with the Firestore Rules from the Firebase Console?";
    if (!(await confirm(msg))) {
      info.writeRules = false;
      return;
    }
  }

  if (setup.projectId) {
    info.rules = await getRulesFromConsole(setup.projectId);
  }
}

async function getRulesFromConsole(projectId: string): Promise<string> {
  const name = await gcp.rules.getLatestRulesetName(projectId, "cloud.firestore");
  if (!name) {
    logger.debug("No rulesets found, using default.");
    return getDefaultRules();
  }

  logger.debug("Found ruleset: " + name);
  const rules = await gcp.rules.getRulesetContent(name);
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
}

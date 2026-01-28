import * as clc from "colorette";

import * as gcp from "../../../gcp";
import { input } from "../../../prompt";
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

  info.rules = getDefaultRules();
  if (setup.projectId) {
    const downloadedRules = await getRulesFromConsole(setup.projectId, info.databaseId);
    if (downloadedRules) {
      info.rules = downloadedRules;
      utils.logBullet(`Downloaded the existing Firestore Security Rules from the Firebase console`);
    }
  }

  info.writeRules = await config.confirmWriteProjectFile(info.rulesFilename, info.rules);
}

async function getRulesFromConsole(projectId: string, databaseId: string): Promise<string | null> {
  // The (default) database does not have a resource name since its releases.name looks like:
  // projects/{project_id}/releases/cloud.firestore
  //
  // A named database would have a resource name, and the releases.name looks like:
  // projects/{project_id}/releases/cloud.firestore/{database_id}
  const resourceName = databaseId === "(default)" ? undefined : databaseId;
  const name = await gcp.rules.getLatestRulesetName(projectId, "cloud.firestore", resourceName);
  if (!name) {
    return null;
  }

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

import * as clc from "colorette";

import { logger } from "../../logger";
import { input } from "../../prompt";
import { readTemplateSync } from "../../templates";
import { Config } from "../../config";
import { Setup } from "..";
import { FirebaseError } from "../../error";
import * as gcp from "../../gcp";
import * as utils from "../../utils";
export interface RequiredInfo {
  rulesFilename: string;
  rules: string;
  writeRules: boolean;
}

const RULES_TEMPLATE = readTemplateSync("init/storage/storage.rules");
const DEFAULT_RULES_FILE = "storage.rules";
export async function askQuestions(setup: Setup, config: Config): Promise<void> {
  logger.info();
  logger.info("Firebase Storage Security Rules allow you to define how and when to allow");
  logger.info("uploads and downloads. You can keep these rules in your project directory");
  logger.info("and publish them with " + clc.bold("firebase deploy") + ".");
  logger.info();

  const info: RequiredInfo = {
    rulesFilename: DEFAULT_RULES_FILE,
    rules: RULES_TEMPLATE,
    writeRules: true,
  };
  info.rulesFilename = await input({
    message: "What file should be used for Storage Rules?",
    default: DEFAULT_RULES_FILE,
  });
  if (setup.projectId) {
    const downloadedRules = await getRulesFromConsole(setup.projectId);
    if (downloadedRules) {
      info.rules = downloadedRules;
      utils.logBullet(`Downloaded the existing Storage Security Rules from the Firebase console`);
    }
  }

  info.writeRules = await config.confirmWriteProjectFile(info.rulesFilename, info.rules);
  // Populate featureInfo for the actuate step later.
  setup.featureInfo = setup.featureInfo || {};
  setup.featureInfo.storage = info;
}

export async function actuate(setup: Setup, config: Config): Promise<void> {
  const info = setup.featureInfo?.storage;
  if (!info) {
    throw new FirebaseError("storage featureInfo is not found");
  }
  // Populate defaults and update `firebase.json` config.
  info.rules = info.rules || RULES_TEMPLATE;
  info.rulesFilename = info.rulesFilename || DEFAULT_RULES_FILE;
  setup.config.storage = {
    rules: info.rulesFilename,
  };

  if (info.writeRules) {
    config.writeProjectFile(info.rulesFilename, info.rules);
  }
}
async function getRulesFromConsole(projectId: string): Promise<string | null> {
  const name = await gcp.rules.getLatestRulesetName(projectId, "firebase.storage");
  if (!name) {
    return null;
  }
  const rules = await gcp.rules.getRulesetContent(name);
  if (rules.length === 0) {
    return utils.reject("Ruleset has no files", { exit: 1 });
  }

  if (rules.length > 1) {
    return utils.reject(`Ruleset has too many files: ${rules.length}`, { exit: 1 });
  }
  return rules[0].content;
}

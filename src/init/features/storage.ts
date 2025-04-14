import * as clc from "colorette";

import { logger } from "../../logger";
import { promptOnce } from "../../prompt";
import { readTemplateSync } from "../../templates";

const RULES_TEMPLATE = readTemplateSync("init/storage/storage.rules");

export async function doSetup(setup: any, config: any): Promise<void> {
  setup.config.storage = {};

  logger.info();
  logger.info("Firebase Storage Security Rules allow you to define how and when to allow");
  logger.info("uploads and downloads. You can keep these rules in your project directory");
  logger.info("and publish them with " + clc.bold("firebase deploy") + ".");
  logger.info();

  const storageRulesFile = await promptOnce({
    type: "input",
    name: "rules",
    message: "What file should be used for Storage Rules?",
    default: "storage.rules",
  });
  setup.config.storage.rules = storageRulesFile;
  await config.askWriteProjectFile(setup.config.storage.rules, RULES_TEMPLATE);
}

import * as clc from "cli-color";
import * as fs from "fs";

import * as apiEnabled from "../../ensureApiEnabled";
import * as logger from "../../logger";
import { promptOnce } from "../../prompt";
import { ensureLocationSet } from "../../ensureCloudResourceLocation";
import { FirebaseError } from "../../error";

const RULES_TEMPLATE = fs.readFileSync(
  __dirname + "/../../../templates/init/storage/storage.rules",
  "utf8"
);

export async function doSetup(setup: any, config: any): Promise<void> {
  const isStorageInabled = await apiEnabled.check(
    setup.projectId,
    "firebasestorage.googleapis.com",
    "",
    true
  );
  if (!isStorageInabled) {
    throw new FirebaseError(
      `It looks like you haven't used Cloud Storage in this project before. Go to ${clc.bold.underline(
        `https://console.firebase.google.com/project/${setup.projectId}/storage`
      )} to create your Storage bucket.`,
      { exit: 1 }
    );
  }

  setup.config.storage = {};
  ensureLocationSet(setup.projectLocation, "Cloud Storage");

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
  config.writeProjectFile(setup.config.storage.rules, RULES_TEMPLATE);
}

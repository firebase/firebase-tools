import * as _ from "lodash";
import * as clc from "colorette";

import { loadCJSON } from "../../loadCJSON";
import { RulesDeploy, RulesetServiceType } from "../../rulesDeploy";
import utils = require("../../utils");
import { Options } from "../../options";
import * as fsConfig from "../../firestore/fsConfig";

/**
 * Prepares Firestore Rules deploys.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
async function prepareRules(context: any, options: Options, rulesDeploy: RulesDeploy, databaseId: string, rulesFile: string): Promise<void> {
    rulesDeploy.addFile(rulesFile);
    context.firestore.rules.push({
      databaseId,
      rulesFile,
    });
  }
}
/**
 * Prepares Firestore Indexes deploys.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
function prepareIndexes(context: any, options: Options, databaseId: string, indexesFileName: string): void {

  const indexesPath = options.config.path(indexesFileName);
  const parsedSrc = loadCJSON(indexesPath);

  utils.logBullet(
    `${clc.bold(clc.cyan("firestore:"))} reading indexes from ${clc.bold(indexesFileName)}...`
  );

  context.firestore.indexes.push({
    databaseId,
    indexesFileName,
    parsedSrc,
  });
}

/**
 * Prepares Firestore deploys.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
export default async function (context: any, options: any): Promise<void> {
  if (options.only) {
    const targets = options.only.split(",");
    const onlyIndexes = targets.indexOf("firestore:indexes") >= 0;
    const onlyRules = targets.indexOf("firestore:rules") >= 0;
    const onlyFirestore = targets.indexOf("firestore") >= 0;

    context.firestoreIndexes = onlyIndexes || onlyFirestore;
    context.firestoreRules = onlyRules || onlyFirestore;
  } else {
    context.firestoreIndexes = true;
    context.firestoreRules = true;
  }

  const firestoreConfigs : fsConfig.ParsedFirestoreConfig[] = fsConfig.getFirestoreConfig(context.projectId, options);
  if (!firestoreConfigs || firestoreConfigs.length === 0) {
    return;
  }

  context.firestore = context.firestore || {};
  context.firestore.indexes = []
  context.firestore.rules = []
  const rulesDeploy : RulesDeploy = new RulesDeploy(options, RulesetServiceType.CLOUD_FIRESTORE);
  _.set(context, "firestore.rulesDeploy", rulesDeploy);

  firestoreConfigs.forEach((firestoreConfig: fsConfig.ParsedFirestoreConfig) => {
    if (firestoreConfig.indexes) {
      prepareIndexes(context, options, firestoreConfig.databaseId, firestoreConfig.indexes)
    }
    if (firestoreConfig.rules) {
      prepareRules(context, options, rulesDeploy, firestoreConfig.databaseId, firestoreConfig.rules)
    }
  });

  if (context.firestore.rules.length > 0) {
    await rulesDeploy.compile();
  }
}
import * as _ from "lodash";
import * as clc from "cli-color";

import loadCJSON = require("../../loadCJSON");
import { RulesDeploy, RulesetServiceType } from "../../rulesDeploy";
import utils = require("../../utils");
import { Options } from "../../options";

/**
 * Prepares Firestore Rules deploys.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
async function prepareRules(context: any, options: Options): Promise<void> {
  const rulesFile = options.config.src.firestore?.rules;

  if (context.firestoreRules && rulesFile) {
    const rulesDeploy = new RulesDeploy(options, RulesetServiceType.CLOUD_FIRESTORE);
    _.set(context, "firestore.rulesDeploy", rulesDeploy);
    rulesDeploy.addFile(rulesFile);
    await rulesDeploy.compile();
  }
}
/**
 * Prepares Firestore Indexes deploys.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
function prepareIndexes(context: any, options: Options): void {
  if (!context.firestoreIndexes || !options.config.src.firestore?.indexes) {
    return;
  }

  const indexesFileName = options.config.src.firestore.indexes;
  const indexesPath = options.config.path(indexesFileName);
  const parsedSrc = loadCJSON(indexesPath);

  utils.logBullet(
    `${clc.bold.cyan("firestore:")} reading indexes from ${clc.bold(indexesFileName)}...`
  );

  context.firestore = context.firestore || {};
  context.firestore.indexes = {
    name: indexesFileName,
    content: parsedSrc,
  };
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

  prepareIndexes(context, options);
  await prepareRules(context, options);
}

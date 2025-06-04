import * as clc from "colorette";

import { loadCJSON } from "../../loadCJSON";
import { RulesDeploy, RulesetServiceType } from "../../rulesDeploy";
import * as utils from "../../utils";
import { Options } from "../../options";
import * as fsConfig from "../../firestore/fsConfig";
import { logger } from "../../logger";
import { DeployOptions } from "..";

export interface RulesContext {
  databaseId: string;
  rulesFile: string;
}

export interface IndexContext {
  databaseId: string;
  indexesFileName: string;
  indexesRawSpec: any; // could be the old v1beta1 indexes spec or the new v1/v1 format
}

/**
 * Prepares Firestore Rules deploys.
 * @param context The deploy context.
 * @param rulesDeploy The object encapsulating logic for deploying rules.
 * @param databaseId The id of the database rulesFile corresponds to.
 * @param rulesFile File name for the Firestore rules to be deployed.
 */
function prepareRules(
  context: any,
  rulesDeploy: RulesDeploy,
  databaseId: string,
  rulesFile: string,
): void {
  rulesDeploy.addFile(rulesFile);
  context.firestore.rules.push({
    databaseId,
    rulesFile,
  } as RulesContext);
}

/**
 * Prepares Firestore Indexes deploys.
 * @param context The deploy context.
 * @param options The CLI options object.
 * @param databaseId The id of the database indexesFileName corresponds to.
 * @param indexesFileName File name for the index configs to be parsed from.
 */
function prepareIndexes(
  context: any,
  options: Options,
  databaseId: string,
  indexesFileName: string,
): void {
  const indexesPath = options.config.path(indexesFileName);
  const indexesRawSpec = loadCJSON(indexesPath);

  utils.logBullet(
    `${clc.bold(clc.cyan("firestore:"))} reading indexes from ${clc.bold(indexesFileName)}...`,
  );

  context.firestore.indexes.push({
    databaseId,
    indexesFileName,
    indexesRawSpec,
  } as IndexContext);
}

/**
 * Prepares Firestore deploys.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
export default async function (context: any, options: DeployOptions): Promise<void> {
  if (options.only) {
    const targets = options.only.split(",");

    // Used for edge case when deploying to a named database
    // https://github.com/firebase/firebase-tools/pull/6129
    const excludeRules = targets.indexOf("firestore:indexes") >= 0;
    const excludeIndexes = targets.indexOf("firestore:rules") >= 0;

    // Used for edge case when deploying --only firestore:rules,firestore:indexes
    // https://github.com/firebase/firebase-tools/issues/6857
    const includeRules = targets.indexOf("firestore:rules") >= 0;
    const includeIndexes = targets.indexOf("firestore:indexes") >= 0;

    const onlyFirestore = targets.indexOf("firestore") >= 0;

    context.firestoreIndexes = !excludeIndexes || includeIndexes || onlyFirestore;
    context.firestoreRules = !excludeRules || includeRules || onlyFirestore;
  } else {
    context.firestoreIndexes = true;
    context.firestoreRules = true;
  }

  const firestoreConfigs: fsConfig.ParsedFirestoreConfig[] = fsConfig.getFirestoreConfig(
    context.projectId,
    options,
  );
  if (!firestoreConfigs || firestoreConfigs.length === 0) {
    return;
  }

  context.firestore = context.firestore || {};
  context.firestore.indexes = [];
  context.firestore.rules = [];
  const rulesDeploy: RulesDeploy = new RulesDeploy(options, RulesetServiceType.CLOUD_FIRESTORE);
  context.firestore.rulesDeploy = rulesDeploy;

  for (const firestoreConfig of firestoreConfigs) {
    if (firestoreConfig.indexes) {
      prepareIndexes(context, options, firestoreConfig.database, firestoreConfig.indexes);
    }
    if (firestoreConfig.rules) {
      prepareRules(context, rulesDeploy, firestoreConfig.database, firestoreConfig.rules);
    }
  }

  if (context.firestore.rules.length > 0) {
    await rulesDeploy.compile();
  }

  const rulesContext: RulesContext[] = context?.firestore?.rules;
  for (const ruleContext of rulesContext) {
    const databaseId = ruleContext.databaseId;
    const rulesFile = ruleContext.rulesFile;
    if (!rulesFile) {
      logger.error(
        `Invalid firestore config for ${databaseId} database: ${JSON.stringify(
          options.config.src.firestore,
        )}`,
      );
    }
  }
}

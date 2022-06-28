/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as _ from "lodash";
import * as clc from "cli-color";

import { loadCJSON } from "../../loadCJSON";
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

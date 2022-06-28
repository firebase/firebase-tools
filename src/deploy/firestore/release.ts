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

import { RulesDeploy, RulesetServiceType } from "../../rulesDeploy";
import { Options } from "../../options";
import { FirebaseError } from "../../error";

/**
 * Releases Firestore rules.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
export default async function (context: any, options: Options): Promise<void> {
  const rulesDeploy: RulesDeploy = _.get(context, "firestore.rulesDeploy");
  if (!context.firestoreRules || !rulesDeploy) {
    return;
  }

  const rulesFile = options.config.src.firestore?.rules;
  if (!rulesFile) {
    throw new FirebaseError(
      `Invalid firestore config: ${JSON.stringify(options.config.src.firestore)}`
    );
  }
  await rulesDeploy.release(rulesFile, RulesetServiceType.CLOUD_FIRESTORE);
}

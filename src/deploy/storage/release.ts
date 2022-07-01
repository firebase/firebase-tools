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

import { get } from "lodash";

import { RulesDeploy, RulesetServiceType } from "../../rulesDeploy";

/**
 * Releases Firebase Storage rules.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
export default async function (context: any, options: any): Promise<void> {
  const rules = get(context, "storage.rules", []);
  const rulesDeploy: RulesDeploy = get(context, "storage.rulesDeploy");
  if (!rules.length || !rulesDeploy) {
    return;
  }

  const toRelease: Array<{ bucket: string; rules: any }> = [];
  for (const ruleConfig of rules) {
    if (ruleConfig.target) {
      options.rc.target(options.project, "storage", ruleConfig.target).forEach((bucket: string) => {
        toRelease.push({ bucket: bucket, rules: ruleConfig.rules });
      });
    } else {
      toRelease.push({ bucket: ruleConfig.bucket, rules: ruleConfig.rules });
    }
  }

  await Promise.all(
    toRelease.map((release) => {
      return rulesDeploy.release(
        release.rules,
        RulesetServiceType.FIREBASE_STORAGE,
        release.bucket
      );
    })
  );
}

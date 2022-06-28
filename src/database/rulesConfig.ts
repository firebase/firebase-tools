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

import { FirebaseError } from "../error";
import { logger } from "../logger";
import { Options } from "../options";
import * as utils from "../utils";

export interface RulesInstanceConfig {
  instance: string;
  rules: string;
}

/**
 * Convert the relative paths in the config into absolute paths ready to be read.
 */
export function normalizeRulesConfig(
  rulesConfig: RulesInstanceConfig[],
  options: Options
): RulesInstanceConfig[] {
  const config = options.config;
  return rulesConfig.map((rc) => {
    return {
      instance: rc.instance,
      rules: config.path(rc.rules),
    };
  });
}

export function getRulesConfig(projectId: string, options: Options): RulesInstanceConfig[] {
  const dbConfig = options.config.src.database;
  if (dbConfig === undefined) {
    return [];
  }

  if (!Array.isArray(dbConfig)) {
    if (dbConfig && dbConfig.rules) {
      utils.assertIsStringOrUndefined(options.instance);
      const instance = options.instance || `${options.project}-default-rtdb`;
      return [{ rules: dbConfig.rules, instance }];
    } else {
      logger.debug("Possibly invalid database config: ", JSON.stringify(dbConfig));
      return [];
    }
  }

  const results: RulesInstanceConfig[] = [];
  const rc = options.rc as any;
  for (const c of dbConfig) {
    if (c.target) {
      // Make sure the target exists (this will throw otherwise)
      rc.requireTarget(projectId, "database", c.target);

      // Get a list of db instances the target maps to
      const instances: string[] = rc.target(projectId, "database", c.target);
      for (const i of instances) {
        results.push({ instance: i, rules: c.rules });
      }
    } else if (c.instance) {
      results.push(c as RulesInstanceConfig);
    } else {
      throw new FirebaseError('Must supply either "target" or "instance" in database config');
    }
  }

  return results;
}

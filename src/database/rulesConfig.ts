import { FirebaseError } from "../error";
import { Config } from "../config";
import { logger } from "../logger";
import { Options } from "../options";
import * as utils from "../utils";

export interface RulesInstanceConfig {
  instance: string;
  rules: string;
}

interface DatabaseConfig {
  rules: string;
  target?: string;
  instance?: string;
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

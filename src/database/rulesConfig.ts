import { FirebaseError } from "../error";
import * as Config from "../config";
import * as logger from "../logger";

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
  options: any
): RulesInstanceConfig[] {
  const config = options.config as Config;
  return rulesConfig.map((rc) => {
    return {
      instance: rc.instance,
      rules: config.path(rc.rules),
    };
  });
}

export function getRulesConfig(projectId: string, options: any): RulesInstanceConfig[] {
  // TODO(samstern): Config should be typed
  const config = options.config as any;

  const dbConfig: { rules?: string } | DatabaseConfig[] | undefined = config.get("database");

  if (dbConfig === undefined) {
    return [];
  }

  if (!Array.isArray(dbConfig)) {
    if (dbConfig && dbConfig.rules) {
      return [{ rules: dbConfig.rules, instance: options.instance || options.project }];
    } else {
      logger.debug("Possibly invalid database config: ", JSON.stringify(dbConfig));
      return [];
    }
  }

  const results: RulesInstanceConfig[] = [];
  for (const c of dbConfig) {
    if (c.target) {
      // Make sure the target exists (this will throw otherwise)
      options.rc.requireTarget(projectId, "database", c.target);

      // Get a list of db instances the target maps to
      const instances: string[] = options.rc.target(projectId, "database", c.target);
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

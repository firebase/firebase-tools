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
  options: Options,
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

  const rc = options.rc;
  let allDatabases = !options.only;
  const onlyDatabases = new Set<string>();
  if (options.only) {
    const split = options.only.split(",");
    if (split.includes("database")) {
      allDatabases = true;
    } else {
      for (const value of split) {
        if (value.startsWith("database:")) {
          const target = value.split(":")[1];
          onlyDatabases.add(target);
        }
      }
    }
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
  for (const c of dbConfig) {
    const { instance, target } = c;
    if (target) {
      if (allDatabases || onlyDatabases.has(target)) {
        // Make sure the target exists (this will throw otherwise)
        rc.requireTarget(projectId, "database", target);
        // Get a list of db instances the target maps to
        const instances = rc.target(projectId, "database", target);
        for (const i of instances) {
          results.push({ instance: i, rules: c.rules });
        }
        onlyDatabases.delete(target);
      }
    } else if (instance) {
      if (allDatabases) {
        results.push(c as RulesInstanceConfig);
      }
    } else {
      throw new FirebaseError('Must supply either "target" or "instance" in database config');
    }
  }

  if (!allDatabases && onlyDatabases.size !== 0) {
    throw new FirebaseError(
      `Could not find configurations in firebase.json for the following database targets: ${[
        ...onlyDatabases,
      ].join(", ")}`,
    );
  }

  return results;
}

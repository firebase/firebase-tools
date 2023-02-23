import { FirebaseError } from "../error";
import { logger } from "../logger";
import { Options } from "../options";

export interface fsInstanceConfig {
  instance: string;
  rules?: string;
  indexes?: string;
}

export function getRulesConfig(projectId: string, options: Options): fsInstanceConfig[] {
  const fsConfig = options.config.src.firestore;
  if (fsConfig === undefined) {
    return [];
  }

  const rc = options.rc;
  let allDatabases = !options.only;
  const onlyDatabases = new Set<string>();
  if (options.only) {
    const split = options.only.split(",");
    if (split.includes("firestore")) {
      allDatabases = true;
    } else {
      for (const value of split) {
        if (value.startsWith("firestore:")) {
          const target = value.split(":")[1];
          onlyDatabases.add(target);
        }
      }
    }
  }

  // single DB (default)
  if (!Array.isArray(fsConfig)) {
    if (fsConfig) {
      const instance = `(default)`;
      return [{ rules: fsConfig.rules, indexes: fsConfig.indexes, instance }];
    } else {
      logger.debug("Possibly invalid database config: ", JSON.stringify(fsConfig));
      return [];
    }
  }

  const results: fsInstanceConfig[] = [];
  for (const c of fsConfig) {
    const { instance, target } = c;
    if (target) {
      if (allDatabases || onlyDatabases.has(target)) {
        // Make sure the target exists (this will throw otherwise)
        rc.requireTarget(projectId, "firestore", target);
        // Get a list of firestore instances the target maps to
        const instances = rc.target(projectId, "firestore", target);
        for (const i of instances) {
          results.push({ instance: i, rules: c.rules, indexes: c.indexes });
        }
        onlyDatabases.delete(target);
      }
    } else if (instance) {
      if (allDatabases) {
        results.push(c as fsInstanceConfig);
      }
    } else {
      throw new FirebaseError('Must supply either "target" or "instance" in firestore config');
    }
  }

  if (!allDatabases && onlyDatabases.size !== 0) {
    throw new FirebaseError(
      `Could not find configurations in firebase.json for the following database targets: ${[
        ...onlyDatabases,
      ].join(", ")}`
    );
  }

  return results;
}

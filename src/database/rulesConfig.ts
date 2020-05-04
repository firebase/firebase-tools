import * as Config from "../config";
import { FirebaseError } from "../error";

export interface RulesInstanceConfig {
  instance: string;
  rules: string;
}

interface DatabaseConfig {
  rules: string;
  target?: string;
  instance?: string;
}

export function getRulesConfig(projectId: string, options: any): RulesInstanceConfig[] {
  // TODO(samstern): Use the real config type here
  const config = options.config as any;

  // First check if the config is of the simple variety "database: { rules: string }"
  const simpleRules: string | undefined = config.get("database.rules");
  if (simpleRules) {
    return [{ rules: simpleRules, instance: options.instance }];
  }

  // Now we know the config is either undefined or more complex
  const dbConfig: DatabaseConfig[] | undefined = config.get("database");
  if (dbConfig === undefined) {
    return [];
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

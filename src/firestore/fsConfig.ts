import { FirebaseError } from "../error";
import { logger } from "../logger";
import { Options } from "../options";

export interface ParsedFirestoreConfig {
  database: string;
  rules?: string;
  indexes?: string;
}

type FirestoreResource = "rules" | "indexes";

interface FirestoreSelection {
  allDatabases: boolean;
  allResources: Set<FirestoreResource>;
  byName: Map<string, Set<FirestoreResource>>;
}

function invalidFirestoreTargetMessage(value: string): string {
  return (
    `Invalid Firestore deploy target: "${value}". Expected "firestore", ` +
    `"firestore:<databaseId|target>", "firestore:<databaseId|target>:rules", ` +
    `"firestore:<databaseId|target>:indexes", "firestore:rules", or "firestore:indexes".`
  );
}

function parseFirestoreSelection(only: string | undefined): FirestoreSelection {
  const selection: FirestoreSelection = {
    allDatabases: !only,
    allResources: new Set<FirestoreResource>(["rules", "indexes"]),
    byName: new Map(),
  };
  if (!only) {
    return selection;
  }

  selection.allResources.clear();
  const addResources = (name: string | undefined, resources: FirestoreResource[]): void => {
    const target = name
      ? selection.byName.get(name) || new Set<FirestoreResource>()
      : selection.allResources;
    for (const resource of resources) {
      target.add(resource);
    }
    if (name) {
      selection.byName.set(name, target);
    }
  };

  for (const value of only.split(",")) {
    if (value === "firestore") {
      selection.allDatabases = true;
      addResources(undefined, ["rules", "indexes"]);
      continue;
    }
    if (!value.startsWith("firestore:")) {
      continue;
    }

    const parts = value.split(":");
    const name = parts[1];
    const resource = parts[2];
    if (
      !name ||
      parts.length > 3 ||
      (parts.length === 3 && !resource) ||
      (resource && resource !== "rules" && resource !== "indexes")
    ) {
      throw new FirebaseError(invalidFirestoreTargetMessage(value), { exit: 1 });
    }

    if (name === "rules" || name === "indexes") {
      if (resource) {
        throw new FirebaseError(invalidFirestoreTargetMessage(value), { exit: 1 });
      }
      selection.allDatabases = true;
      addResources(undefined, [name as FirestoreResource]);
    } else {
      addResources(name, resource ? [resource as FirestoreResource] : ["rules", "indexes"]);
    }
  }
  return selection;
}

function unmatchedFirestoreTargetMessage(unmatched: string[]): string {
  return `Could not find configurations in firebase.json for the following database targets: ${unmatched.join(
    ", ",
  )}`;
}

function filterFirestoreConfig(
  config: ParsedFirestoreConfig,
  resources: Set<FirestoreResource>,
): ParsedFirestoreConfig {
  return {
    ...config,
    rules: resources.has("rules") ? config.rules : undefined,
    indexes: resources.has("indexes") ? config.indexes : undefined,
  };
}

/**
 * Returns Firestore configuration entries selected for deployment.
 * @param projectId The Firebase project ID.
 * @param options The CLI options, including any Firestore deploy target.
 */
export function getFirestoreConfig(projectId: string, options: Options): ParsedFirestoreConfig[] {
  const fsConfig = options.config.src.firestore;
  if (fsConfig === undefined) {
    return [];
  }

  const rc = options.rc;
  const selection = parseFirestoreSelection(options.only);

  // single DB
  if (!Array.isArray(fsConfig)) {
    if (fsConfig) {
      // databaseId is (default) if none provided
      const databaseId = fsConfig.database || `(default)`;
      const unmatched = [...selection.byName.keys()].filter((name) => name !== databaseId);
      if (unmatched.length !== 0) {
        throw new FirebaseError(unmatchedFirestoreTargetMessage(unmatched), { exit: 1 });
      }
      const resources = new Set(selection.allResources);
      for (const resource of selection.byName.get(databaseId) || []) {
        resources.add(resource);
      }
      if (resources.size === 0) {
        return [];
      }
      return [
        filterFirestoreConfig(
          { rules: fsConfig.rules, indexes: fsConfig.indexes, database: databaseId },
          resources,
        ),
      ];
    } else {
      logger.debug("Possibly invalid database config: ", JSON.stringify(fsConfig));
      return [];
    }
  }

  const results: ParsedFirestoreConfig[] = [];
  const consumed = new Set<string>();
  for (const c of fsConfig) {
    const { database, target } = c;
    if (target) {
      const targetSelected = selection.allDatabases || selection.byName.has(target);
      if (targetSelected) {
        // Make sure the target exists (this will throw otherwise)
        rc.requireTarget(projectId, "firestore", target);
        consumed.add(target);
        // Get a list of firestore instances the target maps to
        const databases = rc.target(projectId, "firestore", target);
        for (const database of databases) {
          const resources = new Set(selection.allResources);
          for (const resource of selection.byName.get(target) || []) {
            resources.add(resource);
          }
          results.push(
            filterFirestoreConfig({ database, rules: c.rules, indexes: c.indexes }, resources),
          );
        }
      }
    } else if (database) {
      const databaseSelected = selection.allDatabases || selection.byName.has(database);
      if (databaseSelected) {
        consumed.add(database);
        const resources = new Set(selection.allResources);
        for (const resource of selection.byName.get(database) || []) {
          resources.add(resource);
        }
        results.push(
          filterFirestoreConfig({ database, rules: c.rules, indexes: c.indexes }, resources),
        );
      }
    } else {
      throw new FirebaseError('Must supply either "target" or "databaseId" in firestore config');
    }
  }

  const unmatched = [...selection.byName.keys()].filter((name) => !consumed.has(name));
  if (!selection.allDatabases && unmatched.length !== 0) {
    throw new FirebaseError(unmatchedFirestoreTargetMessage(unmatched), { exit: 1 });
  }

  return results;
}

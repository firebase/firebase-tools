"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFirestoreConfig = void 0;
const error_1 = require("../error");
const logger_1 = require("../logger");
function getFirestoreConfig(projectId, options) {
    const fsConfig = options.config.src.firestore;
    if (fsConfig === undefined) {
        return [];
    }
    const rc = options.rc;
    let allDatabases = !options.only;
    const onlyDatabases = new Set();
    if (options.only) {
        const split = options.only.split(",");
        if (split.includes("firestore")) {
            allDatabases = true;
        }
        else {
            for (const value of split) {
                if (value.startsWith("firestore:")) {
                    const target = value.split(":")[1];
                    onlyDatabases.add(target);
                }
            }
        }
    }
    // single DB
    if (!Array.isArray(fsConfig)) {
        if (fsConfig) {
            // databaseId is (default) if none provided
            const databaseId = fsConfig.database || `(default)`;
            return [{ rules: fsConfig.rules, indexes: fsConfig.indexes, database: databaseId }];
        }
        else {
            logger_1.logger.debug("Possibly invalid database config: ", JSON.stringify(fsConfig));
            return [];
        }
    }
    const results = [];
    for (const c of fsConfig) {
        const { database, target } = c;
        if (target) {
            if (allDatabases || onlyDatabases.has(target)) {
                // Make sure the target exists (this will throw otherwise)
                rc.requireTarget(projectId, "firestore", target);
                // Get a list of firestore instances the target maps to
                const databases = rc.target(projectId, "firestore", target);
                for (const database of databases) {
                    results.push({ database, rules: c.rules, indexes: c.indexes });
                }
                onlyDatabases.delete(target);
            }
        }
        else if (database) {
            if (allDatabases || onlyDatabases.has(database)) {
                results.push(c);
                onlyDatabases.delete(database);
            }
        }
        else {
            throw new error_1.FirebaseError('Must supply either "target" or "databaseId" in firestore config');
        }
    }
    // If user specifies firestore:rules or firestore:indexes make sure we don't throw an error if this doesn't match a database name
    if (onlyDatabases.has("rules")) {
        onlyDatabases.delete("rules");
    }
    if (onlyDatabases.has("indexes")) {
        onlyDatabases.delete("indexes");
    }
    if (!allDatabases && onlyDatabases.size !== 0) {
        throw new error_1.FirebaseError(`Could not find configurations in firebase.json for the following database targets: ${[
            ...onlyDatabases,
        ].join(", ")}`);
    }
    return results;
}
exports.getFirestoreConfig = getFirestoreConfig;

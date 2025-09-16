"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isGraphQLResponseError = exports.isGraphQLResponse = exports.toDatasource = exports.Platform = exports.requiresVector = exports.SCHEMA_ID = void 0;
// Schema is a singleton, so we always call it 'main'
exports.SCHEMA_ID = "main";
function requiresVector(dm) {
    return dm?.primaryDataSource?.postgres?.requiredExtensions?.includes("vector") ?? false;
}
exports.requiresVector = requiresVector;
var Platform;
(function (Platform) {
    Platform["NONE"] = "NONE";
    Platform["ANDROID"] = "ANDROID";
    Platform["WEB"] = "WEB";
    Platform["IOS"] = "IOS";
    Platform["FLUTTER"] = "FLUTTER";
    Platform["MULTIPLE"] = "MULTIPLE";
})(Platform = exports.Platform || (exports.Platform = {}));
function toDatasource(projectId, locationId, ds) {
    if (ds?.postgresql) {
        return {
            postgresql: {
                database: ds.postgresql.database,
                cloudSql: {
                    instance: `projects/${projectId}/locations/${locationId}/instances/${ds.postgresql.cloudSql.instanceId}`,
                },
                schemaValidation: ds.postgresql.schemaValidation,
            },
        };
    }
    return {};
}
exports.toDatasource = toDatasource;
const isGraphQLResponse = (g) => !!g.data || !!g.errors;
exports.isGraphQLResponse = isGraphQLResponse;
const isGraphQLResponseError = (g) => !!g.error;
exports.isGraphQLResponseError = isGraphQLResponseError;
/** End Dataplane Client Types */
//# sourceMappingURL=types.js.map
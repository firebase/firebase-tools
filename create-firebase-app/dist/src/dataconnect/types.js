"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isGraphQLResponseError = exports.isGraphQLResponse = exports.toDatasource = exports.Platform = exports.requiresVector = exports.SCHEMA_ID = void 0;
// Schema is a singleton, so we always call it 'main'
exports.SCHEMA_ID = "main";
function requiresVector(dm) {
    var _a, _b, _c, _d;
    return (_d = (_c = (_b = (_a = dm === null || dm === void 0 ? void 0 : dm.primaryDataSource) === null || _a === void 0 ? void 0 : _a.postgres) === null || _b === void 0 ? void 0 : _b.requiredExtensions) === null || _c === void 0 ? void 0 : _c.includes("vector")) !== null && _d !== void 0 ? _d : false;
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
    if (ds === null || ds === void 0 ? void 0 : ds.postgresql) {
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

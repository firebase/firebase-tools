"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecurrenceType = exports.DatabaseEdition = exports.PointInTimeRecoveryEnablement = exports.PointInTimeRecoveryEnablementOption = exports.DatabaseDeleteProtectionState = exports.DatabaseDeleteProtectionStateOption = exports.DatabaseType = exports.StateTtl = exports.State = exports.ArrayConfig = exports.Order = exports.Density = exports.ApiScope = exports.QueryScope = exports.Mode = void 0;
/**
 * The v1beta1 indexes API used a 'mode' field to represent the indexing mode.
 * This information has now been split into the fields 'arrayConfig' and 'order'.
 * We allow use of 'mode' (for now) so that the move to v1beta2/v1 is not
 * breaking when we can understand the developer's intent.
 */
var Mode;
(function (Mode) {
    Mode["ASCENDING"] = "ASCENDING";
    Mode["DESCENDING"] = "DESCENDING";
    Mode["ARRAY_CONTAINS"] = "ARRAY_CONTAINS";
})(Mode = exports.Mode || (exports.Mode = {}));
var QueryScope;
(function (QueryScope) {
    QueryScope["COLLECTION"] = "COLLECTION";
    QueryScope["COLLECTION_GROUP"] = "COLLECTION_GROUP";
})(QueryScope = exports.QueryScope || (exports.QueryScope = {}));
var ApiScope;
(function (ApiScope) {
    ApiScope["ANY_API"] = "ANY_API";
    ApiScope["DATASTORE_MODE_API"] = "DATASTORE_MODE_API";
    ApiScope["MONGODB_COMPATIBLE_API"] = "MONGODB_COMPATIBLE_API";
})(ApiScope = exports.ApiScope || (exports.ApiScope = {}));
var Density;
(function (Density) {
    Density["DENSITY_UNSPECIFIED"] = "DENSITY_UNSPECIFIED";
    Density["SPARSE_ALL"] = "SPARSE_ALL";
    Density["SPARSE_ANY"] = "SPARSE_ANY";
    Density["DENSE"] = "DENSE";
})(Density = exports.Density || (exports.Density = {}));
var Order;
(function (Order) {
    Order["ASCENDING"] = "ASCENDING";
    Order["DESCENDING"] = "DESCENDING";
})(Order = exports.Order || (exports.Order = {}));
var ArrayConfig;
(function (ArrayConfig) {
    ArrayConfig["CONTAINS"] = "CONTAINS";
})(ArrayConfig = exports.ArrayConfig || (exports.ArrayConfig = {}));
var State;
(function (State) {
    State["CREATING"] = "CREATING";
    State["READY"] = "READY";
    State["NEEDS_REPAIR"] = "NEEDS_REPAIR";
})(State = exports.State || (exports.State = {}));
var StateTtl;
(function (StateTtl) {
    StateTtl["CREATING"] = "CREATING";
    StateTtl["ACTIVE"] = "ACTIVE";
    StateTtl["NEEDS_REPAIR"] = "NEEDS_REPAIR";
})(StateTtl = exports.StateTtl || (exports.StateTtl = {}));
var DatabaseType;
(function (DatabaseType) {
    DatabaseType["DATASTORE_MODE"] = "DATASTORE_MODE";
    DatabaseType["FIRESTORE_NATIVE"] = "FIRESTORE_NATIVE";
})(DatabaseType = exports.DatabaseType || (exports.DatabaseType = {}));
var DatabaseDeleteProtectionStateOption;
(function (DatabaseDeleteProtectionStateOption) {
    DatabaseDeleteProtectionStateOption["ENABLED"] = "ENABLED";
    DatabaseDeleteProtectionStateOption["DISABLED"] = "DISABLED";
})(DatabaseDeleteProtectionStateOption = exports.DatabaseDeleteProtectionStateOption || (exports.DatabaseDeleteProtectionStateOption = {}));
var DatabaseDeleteProtectionState;
(function (DatabaseDeleteProtectionState) {
    DatabaseDeleteProtectionState["ENABLED"] = "DELETE_PROTECTION_ENABLED";
    DatabaseDeleteProtectionState["DISABLED"] = "DELETE_PROTECTION_DISABLED";
})(DatabaseDeleteProtectionState = exports.DatabaseDeleteProtectionState || (exports.DatabaseDeleteProtectionState = {}));
var PointInTimeRecoveryEnablementOption;
(function (PointInTimeRecoveryEnablementOption) {
    PointInTimeRecoveryEnablementOption["ENABLED"] = "ENABLED";
    PointInTimeRecoveryEnablementOption["DISABLED"] = "DISABLED";
})(PointInTimeRecoveryEnablementOption = exports.PointInTimeRecoveryEnablementOption || (exports.PointInTimeRecoveryEnablementOption = {}));
var PointInTimeRecoveryEnablement;
(function (PointInTimeRecoveryEnablement) {
    PointInTimeRecoveryEnablement["ENABLED"] = "POINT_IN_TIME_RECOVERY_ENABLED";
    PointInTimeRecoveryEnablement["DISABLED"] = "POINT_IN_TIME_RECOVERY_DISABLED";
})(PointInTimeRecoveryEnablement = exports.PointInTimeRecoveryEnablement || (exports.PointInTimeRecoveryEnablement = {}));
var DatabaseEdition;
(function (DatabaseEdition) {
    DatabaseEdition["DATABASE_EDITION_UNSPECIFIED"] = "DATABASE_EDITION_UNSPECIFIED";
    DatabaseEdition["STANDARD"] = "STANDARD";
    DatabaseEdition["ENTERPRISE"] = "ENTERPRISE";
})(DatabaseEdition = exports.DatabaseEdition || (exports.DatabaseEdition = {}));
var RecurrenceType;
(function (RecurrenceType) {
    RecurrenceType["DAILY"] = "DAILY";
    RecurrenceType["WEEKLY"] = "WEEKLY";
})(RecurrenceType = exports.RecurrenceType || (exports.RecurrenceType = {}));
//# sourceMappingURL=api-types.js.map
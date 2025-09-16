"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGQLErrors = exports.getInvalidConnectors = exports.getIncompatibleSchemaError = void 0;
const graphqlError_1 = require("./graphqlError");
const INCOMPATIBLE_SCHEMA_ERROR_TYPESTRING = "IncompatibleSqlSchemaError";
const PRECONDITION_ERROR_TYPESTRING = "type.googleapis.com/google.rpc.PreconditionFailure";
const INCOMPATIBLE_CONNECTOR_TYPE = "INCOMPATIBLE_CONNECTOR";
function getIncompatibleSchemaError(err) {
    const incompatibles = errorDetails(err, INCOMPATIBLE_SCHEMA_ERROR_TYPESTRING);
    if (incompatibles.length === 0) {
        return undefined;
    }
    // Should never get multiple incompatible schema errors
    const incompatible = incompatibles[0];
    // Extract the violation type from the precondition error detail.
    const preconditionErrs = errorDetails(err, PRECONDITION_ERROR_TYPESTRING);
    const violationTypes = (incompatible.violationType = preconditionErrs
        .flatMap((preCondErr) => preCondErr.violations)
        .flatMap((viol) => viol.type)
        .filter((type) => type === "INACCESSIBLE_SCHEMA" || type === "INCOMPATIBLE_SCHEMA"));
    incompatible.violationType = violationTypes[0];
    return incompatible;
}
exports.getIncompatibleSchemaError = getIncompatibleSchemaError;
// Note - the backend just includes file name, not the name of the connector resource in the GQLerror extensions.
// so we don't use this yet. Ideally, we'd just include connector name in the extensions.
function getInvalidConnectors(err) {
    var _a, _b;
    const preconditionErrs = errorDetails(err, PRECONDITION_ERROR_TYPESTRING);
    const invalidConns = [];
    for (const preconditionErr of preconditionErrs) {
        const incompatibleConnViolation = (_a = preconditionErr === null || preconditionErr === void 0 ? void 0 : preconditionErr.violations) === null || _a === void 0 ? void 0 : _a.filter((v) => v.type === INCOMPATIBLE_CONNECTOR_TYPE);
        const newConns = (_b = incompatibleConnViolation === null || incompatibleConnViolation === void 0 ? void 0 : incompatibleConnViolation.map((i) => i.subject)) !== null && _b !== void 0 ? _b : [];
        invalidConns.push(...newConns);
    }
    return invalidConns;
}
exports.getInvalidConnectors = getInvalidConnectors;
function getGQLErrors(err) {
    const gqlErrs = errorDetails(err, "GraphqlError");
    return gqlErrs.map(graphqlError_1.prettify).join("\n");
}
exports.getGQLErrors = getGQLErrors;
function errorDetails(err, ofType) {
    var _a, _b;
    const original = ((_b = (_a = err.context) === null || _a === void 0 ? void 0 : _a.body) === null || _b === void 0 ? void 0 : _b.error) || (err === null || err === void 0 ? void 0 : err.original);
    const details = original === null || original === void 0 ? void 0 : original.details;
    return (details === null || details === void 0 ? void 0 : details.filter((d) => { var _a; return (_a = d["@type"]) === null || _a === void 0 ? void 0 : _a.includes(ofType); })) || [];
}

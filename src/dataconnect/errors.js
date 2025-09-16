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
    const preconditionErrs = errorDetails(err, PRECONDITION_ERROR_TYPESTRING);
    const invalidConns = [];
    for (const preconditionErr of preconditionErrs) {
        const incompatibleConnViolation = preconditionErr?.violations?.filter((v) => v.type === INCOMPATIBLE_CONNECTOR_TYPE);
        const newConns = incompatibleConnViolation?.map((i) => i.subject) ?? [];
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
    const original = err.context?.body?.error || err?.original;
    const details = original?.details;
    return details?.filter((d) => d["@type"]?.includes(ofType)) || [];
}
//# sourceMappingURL=errors.js.map
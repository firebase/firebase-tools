import { IncompatibleSqlSchemaError } from "./types";

const INCOMPATIBLE_SCHEMA_ERROR_TYPESTRING = "IncompatibleSqlSchemaError";
const PRECONDITION_ERROR_TYPESTRING = "type.googleapis.com/google.rpc.PreconditionFailure";
const INCOMPATIBLE_CONNECTOR_TYPE = "INCOMPATIBLE_CONNECTOR";

export function getIncompatibleSchemaError(err: any): IncompatibleSqlSchemaError | undefined {
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

// Note - the backend just includes file name, not the name of the connector resource in the GQLerror extensions.
// so we don't use this yet. Ideally, we'd just include connector name in the extensions.
export function getInvalidConnectors(err: any): string[] {
  const preconditionErrs = errorDetails(err, PRECONDITION_ERROR_TYPESTRING);
  const invalidConns: string[] = [];
  for (const preconditionErr of preconditionErrs) {
    const incompatibleConnViolation = preconditionErr?.violations?.filter(
      (v: { type: string }) => v.type === INCOMPATIBLE_CONNECTOR_TYPE,
    );
    const newConns = incompatibleConnViolation?.map((i: { subject: string }) => i.subject) ?? [];
    invalidConns.push(...newConns);
  }
  return invalidConns;
}

function errorDetails(err: any, ofType: string): any[] {
  const original = err.context?.body?.error || err?.original;
  const details: any[] = original?.details;
  return details?.filter((d) => d["@type"]?.includes(ofType)) || [];
}

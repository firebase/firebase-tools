import { IncompatibleSqlSchemaError } from "./types";

const INCOMPATIBLE_SCHEMA_ERROR_TYPESTRING = "IncompatibleSqlSchemaError";
const PRECONDITION_ERROR_TYPESTRING = "type.googleapis.com/google.rpc.PreconditionFailure";
const INCOMPATIBLE_CONNECTOR_TYPE = "INCOMPATIBLE_CONNECTOR";

export function getIncompatibleSchemaError(err: any): IncompatibleSqlSchemaError | undefined {
  const original = err.context?.body?.error || err.orignal;
  if (!original) {
    // If we can't get the original, rethrow so we don't cover up the original error.
    throw err;
  }
  const details: any[] = original.details;
  const incompatibles = details.filter((d) =>
    d["@type"]?.includes(INCOMPATIBLE_SCHEMA_ERROR_TYPESTRING),
  );
  // Should never get multiple incompatible schema errors
  return incompatibles[0];
}

// Note - the backend just includes file name, not the name of the connector resource in the GQLerror extensions.
// so we don't use this yet. Ideally, we'd just include connector name in the extensions.
export function getInvalidConnectors(err: any): string[] {
  const invalidConns: string[] = [];
  const original = err.context?.body?.error || err?.orignal;
  const details: any[] = original?.details;
  const preconditionErrs = details?.filter((d) =>
    d["@type"]?.includes(PRECONDITION_ERROR_TYPESTRING),
  );
  for (const preconditionErr of preconditionErrs) {
    const incompatibleConnViolation = preconditionErr?.violations?.filter(
      (v: { type: string }) => v.type === INCOMPATIBLE_CONNECTOR_TYPE,
    );
    const newConns = incompatibleConnViolation?.map((i: { subject: string }) => i.subject) ?? [];
    invalidConns.push(...newConns);
  }
  return invalidConns;
}

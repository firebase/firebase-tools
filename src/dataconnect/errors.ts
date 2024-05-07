import { GraphqlError, IncompatibleSqlSchemaError } from "./types";

const INCOMPATIBLE_SCHEMA_ERROR_TYPESTRING =
  "type.googleapis.com/google.firebase.dataconnect.v1main.IncompatibleSqlSchemaError";

const GRAPHQL_ERROR_TYPESTRING =
  "type.googleapis.com/google.firebase.dataconnect.v1main.GraphqlError";

export function getIncompatibleSchemaError(err: any): IncompatibleSqlSchemaError | undefined {
  const original = err.context?.body?.error || err.orignal;
  if (!original) {
    // If we can't get the original, rethrow so we don't cover up the original error.
    throw err;
  }
  const details: any[] = original.details;
  const incompatibles = details.filter((d) => d["@type"] === INCOMPATIBLE_SCHEMA_ERROR_TYPESTRING);
  // Should never get multiple incompatible schema errors
  return incompatibles[0];
}

export function isInvalidConnectorError(err: { message?: string }): boolean {
  return err.message?.includes("The request was invalid: invalid connector") ?? false;
}

export function getInvalidConnectorIds(message: string): string[] {
  return message
    .replace("HTTP Error: 400, The request was invalid: invalid connector: ", "")
    .split(", ");
}

// Note - the backend just includes file name, not the name of the connector resource in the GQLerror extensions.
// so we don't use this yet. Ideally, we'd just include connector name in the extensions.
export function getGQLErrors(err: any): GraphqlError[] | undefined {
  const original = err.context?.body?.error || err.orignal;
  if (!original) {
    // If we can't get the original, rethrow so we don't cover up the original error.
    throw err;
  }
  const details: any[] = original.details;
  const gqlErrors = details.filter((d) => d["@type"] === GRAPHQL_ERROR_TYPESTRING);
  return gqlErrors;
}

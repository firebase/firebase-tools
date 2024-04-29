import { GraphqlError } from "./types";

export function prettify(err: GraphqlError): string {
  const message = err.message;
  let header = err.extensions.file ?? "";
  for (const loc of err.locations) {
    header += `(${loc.line}, ${loc.column})`;
  }
  return header.length ? `${header}: ${message}` : message;
}

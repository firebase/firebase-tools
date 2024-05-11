import { GraphqlError } from "./types";

export function prettify(err: GraphqlError): string {
  const message = err.message;
  let header = err.extensions.file ?? "";
  if (err.locations) {
    header += `:${err.locations[0].line}`;
  }
  return header.length ? `${header}: ${message}` : message;
}

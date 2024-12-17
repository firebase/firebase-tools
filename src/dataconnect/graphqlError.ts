import { GraphqlError } from "./types";

export function prettify(err: GraphqlError): string {
  const message = err.message;
  let header = err.extensions?.file ?? "";
  if (err.locations && err.locations.length) {
    const line = err.locations[0]?.line ?? "";
    if (line) {
      header += `:${line}`;
    }
  }
  return header.length ? `${header}: ${message}` : message;
}

export function prettifyWithWorkaround(err: GraphqlError): string {
  if (!err.extensions?.workarounds?.length) {
    return prettify(err);
  }
  let prettified = prettify(err);
  for (const w of err.extensions.workarounds) {
    prettified += `\nWorkaround: ${w.Description}\nReason: ${w.Reason}`;
  }
  return prettified;
}

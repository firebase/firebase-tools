import * as clc from "colorette";
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
  let prettified = `\n${clc.bold("Issue:")} ${prettify(err)}`;
  for (const w of err.extensions.workarounds) {
    prettified += `\n${clc.bold("Workaround:")} ${w.Description}\n${clc.bold("Reason:")} ${w.Reason}`;
  }
  return prettified;
}

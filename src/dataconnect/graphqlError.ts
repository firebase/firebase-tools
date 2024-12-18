import { GraphqlError } from "./types";
const Table = require("cli-table");

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

export function prettifyWithWorkaround(errs: GraphqlError[]): string {
  const table = new Table({
    head: ["Issue", "Workaround", "Reason"],
    style: { head: ["yellow"] },
  });
  for (const e of errs) {
    if (!e.extensions?.workarounds?.length) {
      table.push([prettify(e), "", ""]);
    } else {
      const workarounds = e.extensions.workarounds;
      for (let i = 0; i < workarounds.length; i++) {
        if (i === 0) {
          table.push([prettify(e), workarounds[i].Description, workarounds[i].Reason]);
        } else {
          table.push(["", workarounds[i].Description, workarounds[i].Reason]);
        }
      }
    }
  }
  return table.toString();
}

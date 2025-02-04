import { GraphqlError } from "./types";
const Table = require("cli-table3");

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
    colWidths: [50, 50, 50],
    wordWrap: true,
  });
  for (const e of errs) {
    if (!e.extensions?.workarounds?.length) {
      table.push([prettify(e), "", ""]);
    } else {
      const workarounds = e.extensions.workarounds;
      for (let i = 0; i < workarounds.length; i++) {
        if (i === 0) {
          table.push([prettify(e), workarounds[i].description, workarounds[i].reason]);
        } else {
          table.push(["", workarounds[i].description, workarounds[i].reason]);
        }
      }
    }
  }
  return table.toString();
}

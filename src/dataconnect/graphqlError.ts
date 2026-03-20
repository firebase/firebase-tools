import { GraphqlError } from "./types";
import * as Table from "cli-table3";

export function prettify(err: GraphqlError): string {
  let message = err.message;
  let header = err.extensions?.file ?? "";
  if (err.locations && err.locations.length) {
    const line = err.locations[0]?.line ?? "";
    if (line) {
      header += `:${line}`;
    }
  }

  if (err.path && err.path.length) {
    let pathStr = "On ";
    for (let i = 0; i < err.path.length; i++) {
      if (typeof err.path[i] === "string") {
        if (i === 0) {
          pathStr += err.path[i];
        } else {
          pathStr = `${pathStr}.${err.path[i]}`;
        }
      } else {
        pathStr = `${pathStr}[${err.path[i]}]`;
      }
    }
    message = `${pathStr}: ${message}`;
  }
  return header.length ? `${header}: ${message}` : message;
}

function splitIssueMessage(err: GraphqlError): string[] {
  const msg = err.message.split(": ");
  if (msg.length >= 2) {
    return [msg[0], msg.slice(1).join(":")];
  }
  return ["", err.message];
}

export function prettifyTable(errs: GraphqlError[]): string {
  const table = new Table({
    head: ["Type", "Issue", "Workaround", "Reason"],
    style: { head: ["yellow"] },
    colWidths: [20, 50, 50, 50],
    wordWrap: true,
  });
  // We want to present BREAKING before INSECURE changes. Ordering of other issues matters less, but we want to keep categories grouped together.
  errs.sort((a, b) => a.message.localeCompare(b.message));
  for (const e of errs) {
    const msg = splitIssueMessage(e);
    e.message = msg[1];
    if (!e.extensions?.workarounds?.length) {
      table.push([msg[0], prettify(e), "", ""]);
    } else {
      const workarounds = e.extensions.workarounds;
      for (let i = 0; i < workarounds.length; i++) {
        if (i === 0) {
          table.push([msg[0], prettify(e), workarounds[i].description, workarounds[i].reason]);
        } else {
          table.push(["", "", workarounds[i].description, workarounds[i].reason]);
        }
      }
    }
  }
  return table.toString();
}

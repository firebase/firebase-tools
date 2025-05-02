import { dump } from "js-yaml";
import { Schema, Connector, Source } from "../../../dataconnect/types";

export function schemaToText(s: Schema) {
  return (
    dump({
      name: s.name,
      datasources: s.datasources,
    }) +
    "\n\n" +
    sourceToText(s.source)
  );
}

export function connectorToText(s: Connector) {
  return (
    dump({
      name: s.name,
    }) +
    "\n\n" +
    sourceToText(s.source)
  );
}

export function sourceToText(s: Source) {
  let output = "";
  s.files?.forEach((f) => {
    output += `\n# ${f.path}`;
    output += "\n```graphql\n";
    output += `${f.content.trim()}\n`;
    output += "```\n";
  });
  return output;
}

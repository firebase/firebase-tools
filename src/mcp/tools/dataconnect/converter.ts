import { dump } from "js-yaml";
import { Schema, Connector, Source } from "../../../dataconnect/types";

export function schemaToJson(s: Schema) {
  return (
    dump({
      name: s.name,
      datasources: s.datasources,
    }) +
    "\n\n" +
    sourceToJson(s.source)
  );
}

export function connectorToJson(s: Connector) {
  return (
    dump({
      name: s.name,
    }) +
    "\n\n" +
    sourceToJson(s.source)
  );
}

export function sourceToJson(s: Source) {
  let output = "";
  s.files?.forEach((f) => {
    output += `\n# ${f.path}`;
    output += "\n```graphql\n";
    output += `${f.content.trim()}\n`;
    output += "```\n";
  });
  return output;
}

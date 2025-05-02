import { Schema, Connector, Source } from "../../../dataconnect/types";

export function schemaToJson(s: Schema) {
  return {
    name: s.name,
    datasources: s.datasources,
    source: sourceToJson(s.source),
  };
}

export function connectorToJson(s: Connector) {
  return {
    name: s.name,
    source: sourceToJson(s.source),
  };
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
import { dump } from "js-yaml";
import {
  Schema,
  Connector,
  Source,
  GraphqlResponseError,
  GraphqlResponse,
  isGraphQLResponse,
} from "../../../dataconnect/types";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { mcpError } from "../../util";

export function schemaToText(s: Schema): string {
  return (
    dump({
      name: s.name,
      datasources: s.datasources,
    }) +
    "\n\n" +
    sourceToText(s.source)
  );
}

export function connectorToText(s: Connector): string {
  return (
    dump({
      name: s.name,
    }) +
    "\n\n" +
    sourceToText(s.source)
  );
}

export function sourceToText(s: Source): string {
  let output = "";
  s.files?.forEach((f) => {
    output += `\n# ${f.path}`;
    output += "\n```graphql\n";
    output += `${f.content.trim()}\n`;
    output += "```\n";
  });
  return output;
}

export function graphqlResponseToToolResponse(
  g: GraphqlResponse | GraphqlResponseError,
): CallToolResult {
  if (isGraphQLResponse(g)) {
    const isError = g.errors?.length > 0;
    const contentString = `${isError ? "A GraphQL error occurred while executing the operation:" : ""}${JSON.stringify(g, null, 2)}`;
    return {
      isError,
      content: [{ type: "text", text: contentString }],
    };
  } else {
    return mcpError(JSON.stringify(g, null, 2));
  }
}

export function parseVariables(unparsedVariables?: string): Record<string, any> {
  let obj: unknown;
  try {
    obj = JSON.parse(unparsedVariables || "{}") as unknown;
  } catch (e) {
    throw new Error("Provided variables string `" + unparsedVariables + "` is not valid JSON.");
  }
  if (typeof obj !== "object" || obj == null) throw new Error("not an object");
  return obj;
}

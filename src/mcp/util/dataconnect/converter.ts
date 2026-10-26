import {
  GraphqlResponseError,
  GraphqlResponse,
  isGraphQLResponse,
} from "../../../dataconnect/types";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { mcpError } from "../../util";

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

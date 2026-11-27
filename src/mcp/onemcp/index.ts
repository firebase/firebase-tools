import { dataconnectOrigin, developerKnowledgeOrigin, firestoreOrigin } from "../../api";
import { ServerFeature } from "../types";
import { OneMcpServer } from "./onemcp_server";

// Workaround to inject Mcp-Param-Region for routing before OneMCP fully supports SEP-2243
export function dataConnectLocationHeaderInjector(
  headers: Record<string, string>,
  _toolName: string,
  args: Record<string, unknown>,
): Record<string, string> | undefined {
  if (typeof args?.location === "string" && args.location && !headers["Mcp-Param-Region"]) {
    return { "Mcp-Param-Region": args.location };
  }
}

export const ONEMCP_SERVERS: Partial<Record<ServerFeature, OneMcpServer>> = {
  dataconnect: new OneMcpServer(
    "dataconnect",
    dataconnectOrigin(),
    {
      requiresAuth: true,
    },
    {
      allowedTools: [
        "execute_graphql",
        "execute_graphql_read",
        "generate_schema",
        "generate_query",
        "generate_query_from_schema",
        "list_locations",
      ],
      headerOverride: dataConnectLocationHeaderInjector,
    },
  ),
  developerknowledge: new OneMcpServer(
    "developerknowledge",
    developerKnowledgeOrigin(),
    {
      requiresAuth: true,
    },
    {
      toolsToOptOutProjectRequirement: ["search_documents", "get_documents"],
    },
  ),
  firestore: new OneMcpServer("firestore", firestoreOrigin(), {
    requiresAuth: true,
  }),
};

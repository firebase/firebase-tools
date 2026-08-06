import { dataconnectOrigin, developerKnowledgeOrigin, firestoreOrigin } from "../../api";
import { ServerFeature } from "../types";
import { OneMcpServer } from "./onemcp_server";

export const ONEMCP_SERVERS: Partial<Record<ServerFeature, OneMcpServer>> = {
  dataconnect: new OneMcpServer(
    "dataconnect",
    dataconnectOrigin(),
    {
      requiresAuth: true,
      requiresProject: true,
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
    },
  ),
  developerknowledge: new OneMcpServer("developerknowledge", developerKnowledgeOrigin(), {
    requiresAuth: true,
  }),
  firestore: new OneMcpServer("firestore", firestoreOrigin(), {
    requiresAuth: true,
    requiresProject: true,
  }),
};


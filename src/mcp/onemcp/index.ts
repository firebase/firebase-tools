import { developerKnowledgeOrigin, firestoreOrigin } from "../../api";
import { ServerFeature } from "../types";
import { OneMcpServer } from "./onemcp_server";

export const ONEMCP_SERVERS: Partial<Record<ServerFeature, OneMcpServer>> = {
  developerknowledge: new OneMcpServer("developerknowledge", developerKnowledgeOrigin(), {
    requiresAuth: true,
  }),
  firestore: new OneMcpServer("firestore", firestoreOrigin(), {
    requiresAuth: true,
    requiresProject: true,
  }),
};

import { ServerTool } from "../tool.js";
import { ServerFeature } from "../types.js";
import { authTools } from "./auth/index.js";
import { dataconnectTools } from "./dataconnect/index.js";
import { firestoreTools } from "./firestore/index.js";
import { projectTools } from "./project/index.js";

export const tools: Record<ServerFeature, ServerTool[]> = {
  project: projectTools,
  firestore: firestoreTools,
  auth: authTools,
  dataconnect: dataconnectTools,
  storage: [],
};

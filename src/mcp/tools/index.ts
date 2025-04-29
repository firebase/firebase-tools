import { ServerTool } from "../tool.js";
import { ServerFeature } from "../types.js";
import { authTools } from "./auth/index.js";
import { projectTools } from "./project/index.js";

export const tools: Record<ServerFeature, ServerTool[]> = {
  project: projectTools,
  firestore: [],
  auth: authTools,
  dataconnect: [],
  storage: [],
};

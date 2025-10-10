import { Config } from "../config";
import { RC } from "../rc";
import type { FirebaseMcpServer } from "./index";

export const SERVER_FEATURES = [
  "core",
  "firestore",
  "storage",
  "dataconnect",
  "auth",
  "messaging",
  "functions",
  "remoteconfig",
  "crashlytics",
  "apphosting",
  "rtdb",
] as const;
export type ServerFeature = (typeof SERVER_FEATURES)[number];

export interface ClientConfig {
  /** The current project root directory for this client. */
  projectRoot?: string | null;
}

export interface McpContext {
  projectId: string;
  accountEmail: string | null;
  config: Config;
  host: FirebaseMcpServer;
  rc: RC;
  firebaseCliCommand: string;
}

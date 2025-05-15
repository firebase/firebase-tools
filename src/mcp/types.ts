export const SERVER_FEATURES = [
  "firestore",
  "storage",
  "dataconnect",
  "auth",
  "messaging",
  "remoteconfig",
  "apphosting",
] as const;
export type ServerFeature = (typeof SERVER_FEATURES)[number];

export interface ClientConfig {
  /** The current project root directory for this client. */
  projectRoot?: string | null;
}

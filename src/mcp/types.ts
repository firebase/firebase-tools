export const SERVER_FEATURES = [
  "firestore",
  "storage",
  "dataconnect",
  "auth",
  "messaging",
  "remoteconfig",
] as const;
export type ServerFeature = (typeof SERVER_FEATURES)[number];

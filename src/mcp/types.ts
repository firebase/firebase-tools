export const SERVER_FEATURES = ["firestore", "storage", "dataconnect", "auth"] as const;
export type ServerFeature = (typeof SERVER_FEATURES)[number];

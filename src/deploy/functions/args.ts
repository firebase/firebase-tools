import * as backend from "./backend";
import * as gcfV2 from "../../gcp/cloudfunctionsv2";

// These types should proably be in a root deploy.ts, but we can only boil the ocean one bit at a time.

// Payload holds the output types of what we're building.
export interface Payload {
  functions?: {
    backend: backend.Backend;
  };
}

// Context holds cached values of what we've looked up in handling this request.
// For non-trivial values, use helper functions that cache automatically and/or hide implementation
// details.
export interface Context {
  projectId: string;
  filters: string[][];

  // Filled in the "prepare" phase.
  functionsSource?: string;
  runtimeConfigEnabled?: boolean;
  firebaseConfig?: FirebaseConfig;

  // Filled in the "deploy" phase.
  uploadUrl?: string;
  storageSource?: gcfV2.StorageSource;
}

export interface FirebaseConfig {
  locationId: string;
  projectId: string;
  storageBucket: string;
  databaseURL: string;
}

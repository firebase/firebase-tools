import * as backend from "./backend";
import * as gcfV2 from "../../gcp/cloudfunctionsv2";
import * as projectConfig from "../../functions/projectConfig";
import * as deployHelper from "./functionsDeployHelper";

// These types should probably be in a root deploy.ts, but we can only boil the ocean one bit at a time.

// Payload holds the output of what we want to build + what we already have.
export interface Payload {
  functions?: {
    wantBackend: backend.Backend;
    haveBackend: backend.Backend;
  };
}

// Context holds cached values of what we've looked up in handling this request.
// For non-trivial values, use helper functions that cache automatically and/or hide implementation
// details.
export interface Context {
  projectId: string;
  filters?: deployHelper.EndpointFilter[];

  // Filled in the "prepare" phase.
  config?: projectConfig.ValidatedSingle;
  functionsSourceV1?: string;
  functionsSourceV2?: string;
  runtimeConfigEnabled?: boolean;
  artifactRegistryEnabled?: boolean;
  firebaseConfig?: FirebaseConfig;

  // Filled in the "deploy" phase.
  sourceUrl?: string;
  storage?: Record<string, gcfV2.StorageSource>;
}

export interface FirebaseConfig {
  locationId: string;
  projectId: string;
  storageBucket: string;
  databaseURL: string;
}

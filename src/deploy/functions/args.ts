import * as backend from "./backend";
import * as gcfV2 from "../../gcp/cloudfunctionsv2";
import * as projectConfig from "../../functions/projectConfig";
import { FunctionFilter } from "./functionsDeployHelper";

// These types should proably be in a root deploy.ts, but we can only boil the ocean one bit at a time.

interface CodebasePayload {
  functions?: {
    backend: backend.Backend;
  };
}

// Payload holds the output types of what we're building.
export interface Payload {
  codebases: Record<string, CodebasePayload>;
}

// Deploy context for each deployed codebase.
export interface CodebaseContext {
  // Filled in the "prepare" phase.
  functionsSourceV1?: string;
  functionsSourceV2?: string;

  // Filled in the "deploy" phase.
  sourceUrl?: string;
  storage?: Record<string, gcfV2.StorageSource>;
}

// Context holds cached values of what we've looked up in handling this request.
// For non-trivial values, use helper functions that cache automatically and/or hide implementation
// details.
export interface Context {
  projectId: string;
  filters: FunctionFilter[];

  // Filled in the "prepare" phase.
  config?: projectConfig.ValidatedConfig;
  codebases: Record<string, CodebaseContext>;
  runtimeConfigEnabled?: boolean;
  artifactRegistryEnabled?: boolean;
  firebaseConfig?: FirebaseConfig;

}

export interface FirebaseConfig {
  locationId: string;
  projectId: string;
  storageBucket: string;
  databaseURL: string;
}

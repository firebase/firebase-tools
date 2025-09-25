import { AppHostingSingle } from "../../firebaseConfig";
import { BuildConfig } from "../../gcp/apphosting";

export interface LocalBuild {
  buildConfig: BuildConfig;
  buildDir: string;
  annotations: Record<string, string>;
}

export interface Context {
  backendConfigs: Map<string, AppHostingSingle>;
  backendLocations: Map<string, string>;
  backendStorageUris: Map<string, string>;
  backendLocalBuilds: Record<string, LocalBuild>;
}

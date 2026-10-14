import { AppHostingSingle } from "../../firebaseConfig";
import { BuildConfig } from "../../gcp/apphosting";

export interface LocalBuild {
  buildConfig: BuildConfig;
  outputFiles: string[];
  localBuildScratchDir: string;
}

export interface Context {
  backendConfigs: Record<string, AppHostingSingle>;
  backendLocations: Record<string, string>;
  backendStorageUris: Record<string, string>;
  backendLocalBuilds: Record<string, LocalBuild>;
}

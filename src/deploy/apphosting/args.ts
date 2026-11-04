import { AppHostingSingle } from "../../firebaseConfig";
import { BuildConfig } from "../../gcp/apphosting";

export interface LocalBuild {
  buildConfig: BuildConfig;
  /** The built app, as a .tar.gz tmp file for the deploy step to upload. */
  archive: string;
}

export interface Context {
  backendConfigs: Record<string, AppHostingSingle>;
  backendLocations: Record<string, string>;
  backendStorageUris: Record<string, string>;
  backendLocalBuilds: Record<string, LocalBuild>;
}

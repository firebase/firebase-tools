import { AppHostingSingle } from "../../firebaseConfig";

export interface Context {
  backendConfigs: Record<string, AppHostingSingle>;
  backendLocations: Record<string, string>;
  backendStorageUris: Record<string, string>;
}

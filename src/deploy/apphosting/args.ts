import { AppHostingSingle } from "../../firebaseConfig";

export interface Context {
  backendConfigs: Map<string, AppHostingSingle>;
  backendLocations: Map<string, string>;
  backendStorageUris: Map<string, string>;
}

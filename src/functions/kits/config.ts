import { FirebaseConfig } from "../../firebaseConfig";
import { ValidatedKitSingle, normalizeAndValidate, isKitConfig } from "../projectConfig";

/**
 * Extracts only the Kit configs from a parsed Firebase.json.
 */
export function listKitConfigs(config: FirebaseConfig): ValidatedKitSingle[] {
  const normalized = normalizeAndValidate(config.functions);
  return normalized.filter((s) => isKitConfig(s));
}

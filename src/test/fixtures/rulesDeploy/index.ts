import { resolve } from "path";

/**
 * A directory containing firestore and storage rules to be deployed.
 */
export const FIXTURE_DIR = __dirname;

export const FIXTURE_FIRESTORE_RULES_PATH = resolve(__dirname, "firestore.rules");

import { resolve } from "path";

/**
 * A directory containing a valid .firebaserc file along firebase.json.
 */
export const VALID_RC_DIR = __dirname;

/**
 * Path of the firebase.json in the `VALID_RC_DIR` directory.
 */
export const FIREBASE_JSON_PATH = resolve(__dirname, "firebase.json");

/**
 * A directory containing a .firebaserc file containing invalid JSON.
 */
export const INVALID_RC_DIR = resolve(__dirname, "invalid");

/**
 * A directory containing a .firebaserc file with project alias conflicts.
 *
 * While it does not contain a firebase.json, its parent directory does.
 */
export const CONFLICT_RC_DIR = resolve(__dirname, "conflict");

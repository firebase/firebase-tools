import { resolve } from "path";

/**
 * A directory containing valid full-blown firebase.json.
 */
export const FIXTURE_DIR = import.meta.dirname;

export const FIREBASE_JSON_PATH = resolve(import.meta.dirname, "firebase.json");

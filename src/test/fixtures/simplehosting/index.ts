import { resolve } from "path";

/**
 * A directory containing a simple project with Firebase Hosting configured.
 */
export const FIXTURE_DIR = import.meta.dirname;

export const FIREBASE_JSON_PATH = resolve(import.meta.dirname, "firebase.json");

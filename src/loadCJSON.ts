import { FirebaseError } from "./error";
import * as cjson from "cjson";

/**
 * Loads CJSON from given path.
 */
export function loadCJSON(path: string): any {
  try {
    return cjson.load(path);
  } catch (e: any) {
    if (e.code === "ENOENT") {
      throw new FirebaseError(`File ${path} does not exist`);
    }
    throw new FirebaseError(`Parse Error in ${path}:\n\n${e.message}`);
  }
}

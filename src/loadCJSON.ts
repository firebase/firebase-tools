import * as fs from "fs";
import { FirebaseError } from "./error";

/**
 * Loads CJSON from given path.
 */
export function loadCJSON(path: string): any {
  let content: string;
  try {
    content = fs.readFileSync(path, "utf8");
  } catch (e: any) {
    if (e.code === "ENOENT") {
      throw new FirebaseError(`File ${path} does not exist`);
    }
    throw e;
  }

  try {
    const stripped = content.replace(
      /("([^"\\]|\\.)*")|(\/\*[\s\S]*?\*\/|\/\/.*)/g,
      (match, string) => {
        if (string) return string;
        return "";
      },
    );
    return JSON.parse(stripped);
  } catch (e: any) {
    throw new FirebaseError(`Parse Error in ${path}:\n\n${e.message}`);
  }
}

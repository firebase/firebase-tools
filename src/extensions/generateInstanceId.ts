import * as _ from "lodash";
import * as modsApi from "./modsApi";
import { FirebaseError } from "../error";

const SUFFIX_CHAR_SET = "abcdefghijklmnopqrstuvwxyz0123456789";

export async function generateInstanceId(projectId: string, modName: string): Promise<string> {
  const instanceRes = await modsApi.getInstance(projectId, modName, {
    resolveOnHTTPError: true,
  });
  if (instanceRes.error) {
    if (_.get(instanceRes, "error.code") === 404) {
      return modName;
    }
    throw new FirebaseError("Unexpected error when generating instance ID:", {
      original: instanceRes.error,
    });
  }
  // If there is already an instance named modName
  return `${modName}-${getRandomString(4)}`;
}

export function getRandomString(length: number): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += SUFFIX_CHAR_SET.charAt(Math.floor(Math.random() * SUFFIX_CHAR_SET.length));
  }
  return result;
}

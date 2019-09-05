import * as _ from "lodash";
import * as extensionsApi from "./extensionsApi";
import { FirebaseError } from "../error";

const SUFFIX_CHAR_SET = "abcdefghijklmnopqrstuvwxyz0123456789";

export async function generateInstanceId(
  projectId: string,
  extensionName: string
): Promise<string> {
  const instanceRes = await extensionsApi.getInstance(projectId, extensionName, {
    resolveOnHTTPError: true,
  });
  if (instanceRes.error) {
    if (_.get(instanceRes, "error.code") === 404) {
      return extensionName;
    }
    throw new FirebaseError("Unexpected error when generating instance ID:", {
      original: instanceRes.error,
    });
  }
  // If there is already an instance named extensionName
  return `${extensionName}-${getRandomString(4)}`;
}

export function getRandomString(length: number): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += SUFFIX_CHAR_SET.charAt(Math.floor(Math.random() * SUFFIX_CHAR_SET.length));
  }
  return result;
}

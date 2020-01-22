import * as _ from "lodash";
import * as extensionsApi from "./extensionsApi";
import { FirebaseError } from "../error";

const SUFFIX_CHAR_SET = "abcdefghijklmnopqrstuvwxyz0123456789";

export async function generateInstanceId(
  projectId: string,
  extensionName: string
): Promise<string> {
  const alreadyExists = await checkIfInstanceIdAlreadyExists(projectId, extensionName);
  return alreadyExists ? `${extensionName}-${getRandomString(4)}` : extensionName;
}

export function getRandomString(length: number): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += SUFFIX_CHAR_SET.charAt(Math.floor(Math.random() * SUFFIX_CHAR_SET.length));
  }
  return result;
}

export async function checkIfInstanceIdAlreadyExists(
  projectId: string,
  instanceId: string
): Promise<boolean> {
  const instanceRes = await extensionsApi.getInstance(projectId, instanceId, {
    resolveOnHTTPError: true,
  });
  if (instanceRes.error) {
    if (_.get(instanceRes, "error.code") === 404) {
      return false;
    }
    const msg =
      "Unexpected error when checking if instance ID exists: " +
      _.get(instanceRes, "error.message");
    throw new FirebaseError(msg, {
      original: instanceRes.error,
    });
  }
  return true;
}

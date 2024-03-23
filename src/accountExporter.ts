import { Writable } from "stream";
import * as os from "os";
import * as path from "path";

import { Client } from "./apiv2";
import { FirebaseError } from "./error";
import { googleOrigin } from "./api";
import * as utils from "./utils";

const apiClient = new Client({
  urlPrefix: googleOrigin,
});

// TODO: support for MFA at runtime was added in PR #3173, but this exporter currently ignores `mfaInfo` and loses the data on export.
const EXPORTED_JSON_KEYS = [
  "localId",
  "email",
  "emailVerified",
  "passwordHash",
  "salt",
  "displayName",
  "photoUrl",
  "lastLoginAt",
  "createdAt",
  "phoneNumber",
  "disabled",
  "customAttributes",
];
const EXPORTED_JSON_KEYS_RENAMING: Record<string, string> = {
  lastLoginAt: "lastSignedInAt",
};
const EXPORTED_PROVIDER_USER_INFO_KEYS = [
  "providerId",
  "rawId",
  "email",
  "displayName",
  "photoUrl",
];
const PROVIDER_ID_INDEX_MAP = new Map<string, number>([
  ["google.com", 7],
  ["facebook.com", 11],
  ["twitter.com", 15],
  ["github.com", 19],
]);

function escapeComma(str: string): string {
  if (str.includes(",")) {
    // Encapsulate the string with quotes if it contains a comma.
    return `"${str}"`;
  }
  return str;
}

function convertToNormalBase64(data: string): string {
  return data.replace(/_/g, "/").replace(/-/g, "+");
}

function addProviderUserInfo(providerInfo: any, arr: any[], startPos: number): void {
  arr[startPos] = providerInfo.rawId;
  arr[startPos + 1] = providerInfo.email || "";
  arr[startPos + 2] = escapeComma(providerInfo.displayName || "");
  arr[startPos + 3] = providerInfo.photoUrl || "";
}

function transUserToArray(user: any): any[] {
  const arr = Array(27).fill("");
  arr[0] = user.localId;
  arr[1] = user.email || "";
  arr[2] = user.emailVerified || false;
  arr[3] = convertToNormalBase64(user.passwordHash || "");
  arr[4] = convertToNormalBase64(user.salt || "");
  arr[5] = escapeComma(user.displayName || "");
  arr[6] = user.photoUrl || "";
  for (let i = 0; i < (!user.providerUserInfo ? 0 : user.providerUserInfo.length); i++) {
    const providerInfo = user.providerUserInfo[i];
    if (providerInfo) {
      const providerIndex = PROVIDER_ID_INDEX_MAP.get(providerInfo.providerId);
      if (providerIndex) {
        addProviderUserInfo(providerInfo, arr, providerIndex);
      }
    }
  }
  arr[23] = user.createdAt;
  arr[24] = user.lastLoginAt;
  arr[25] = user.phoneNumber;
  arr[26] = user.disabled;
  // quote entire custom claims object and escape inner quotes with quotes
  arr[27] = user.customAttributes
    ? `"${user.customAttributes.replace(/(?<!\\)"/g, '""')}"`
    : user.customAttributes;
  return arr;
}

function transUserJson(user: any): any {
  const newUser: any = {};
  const pickedUser: Record<string, any> = {};
  for (const k of EXPORTED_JSON_KEYS) {
    pickedUser[k] = user[k];
  }
  for (const [key, value] of Object.entries(pickedUser)) {
    const newKey = EXPORTED_JSON_KEYS_RENAMING[key] || key;
    newUser[newKey] = value;
  }
  if (newUser.passwordHash) {
    newUser.passwordHash = convertToNormalBase64(newUser.passwordHash);
  }
  if (newUser.salt) {
    newUser.salt = convertToNormalBase64(newUser.salt);
  }
  if (user.providerUserInfo) {
    newUser.providerUserInfo = [];
    for (const providerInfo of user.providerUserInfo) {
      if (PROVIDER_ID_INDEX_MAP.has(providerInfo.providerId)) {
        const picked: Record<string, any> = {};
        for (const k of EXPORTED_PROVIDER_USER_INFO_KEYS) {
          picked[k] = providerInfo[k];
        }
        newUser.providerUserInfo.push(picked);
      }
    }
  }
  return newUser;
}

export function validateOptions(options: any, fileName: string): any {
  const exportOptions: any = {};
  if (fileName === undefined) {
    throw new FirebaseError("Must specify data file");
  }
  const extName = path.extname(fileName.toLowerCase());
  if (extName === ".csv") {
    exportOptions.format = "csv";
  } else if (extName === ".json") {
    exportOptions.format = "json";
  } else if (options.format) {
    const format = options.format.toLowerCase();
    if (format === "csv" || format === "json") {
      exportOptions.format = format;
    } else {
      throw new FirebaseError("Unsupported data file format, should be csv or json");
    }
  } else {
    throw new FirebaseError(
      "Please specify data file format in file name, or use `format` parameter",
    );
  }
  return exportOptions;
}

function createWriteUsersToFile(): (
  userList: any[],
  format: "csv" | "json",
  writeStream: Writable,
) => void {
  let jsonSep = "";
  return (userList: any[], format: "csv" | "json", writeStream: Writable) => {
    userList.map((user) => {
      if (user.passwordHash && user.version !== 0) {
        // Password isn't hashed by default Scrypt.
        delete user.passwordHash;
        delete user.salt;
      }
      if (format === "csv") {
        writeStream.write(transUserToArray(user).join(",") + "," + os.EOL, "utf8");
      } else {
        writeStream.write(jsonSep + JSON.stringify(transUserJson(user), null, 2), "utf8");
        jsonSep = "," + os.EOL;
      }
    });
  };
}

export async function serialExportUsers(projectId: string, options: any): Promise<any> {
  if (!options.writeUsersToFile) {
    options.writeUsersToFile = createWriteUsersToFile();
  }
  const postBody: any = {
    targetProjectId: projectId,
    maxResults: options.batchSize,
  };
  if (options.nextPageToken) {
    postBody.nextPageToken = options.nextPageToken;
  }
  if (!options.timeoutRetryCount) {
    options.timeoutRetryCount = 0;
  }
  try {
    const ret = await apiClient.post<any, { users: any[]; nextPageToken: string }>(
      "/identitytoolkit/v3/relyingparty/downloadAccount",
      postBody,
      {
        skipLog: { resBody: true }, // This contains a lot of PII - don't log it.
      },
    );
    options.timeoutRetryCount = 0;
    const userList = ret.body.users;
    if (userList && userList.length > 0) {
      options.writeUsersToFile(userList, options.format, options.writeStream);
      utils.logSuccess("Exported " + userList.length + " account(s) successfully.");
      // The identitytoolkit API do not return a nextPageToken value
      // consistently when the last page is reached
      if (!ret.body.nextPageToken) {
        return;
      }
      options.nextPageToken = ret.body.nextPageToken;
      return serialExportUsers(projectId, options);
    }
  } catch (err: any) {
    // Calling again in case of error timedout so that script won't exit
    if (err.original?.code === "ETIMEDOUT") {
      options.timeoutRetryCount++;
      if (options.timeoutRetryCount > 5) {
        return err;
      }
      return serialExportUsers(projectId, options);
    }
    if (err instanceof FirebaseError) {
      throw err;
    } else {
      throw new FirebaseError(`Failed to export accounts: ${err}`, { original: err });
    }
  }
}

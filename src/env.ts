import { dirExistsSync } from "./fsutils";

let googleIdxFolderExists: boolean | undefined;
export function isFirebaseStudio() {
  if (googleIdxFolderExists === true || process.env.MONOSPACE_ENV) return true;
  googleIdxFolderExists = dirExistsSync("/google/idx");
  return googleIdxFolderExists;
}

export function isFirebaseMcp() {
  return !!process.env.IS_FIREBASE_MCP;
}

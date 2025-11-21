import * as path from "path";


export type RunDirectories = { testDir: string; runDir: string; userDir: string };

export function getAgentEvalsRoot(): string {
  return path.resolve(path.join(__dirname, "..", ".."));
}

export function getFirebaseCliRoot(): string {
  return path.resolve(__dirname, "..", "..", "..", "..");
}

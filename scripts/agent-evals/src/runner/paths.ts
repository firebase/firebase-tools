import path from "path";
import { fileURLToPath } from "url";

export type RunDirectories = { testDir: string; runDir: string; userDir: string };

export function getAgentEvalsRoot(): string {
  const thisFilePath = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(path.join(thisFilePath, "..", ".."));
}

export function getFirebaseCliRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
}

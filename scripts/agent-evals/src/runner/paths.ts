import path from "node:path";
import { fileURLToPath } from "node:url";

export function getFirebaseCliRoot(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..", // runner
    "..", // src
    "..", // agent-evals
    "..", // scripts
  );
}
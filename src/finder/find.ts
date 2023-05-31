// Convert the Github remoteURL repository to a folder or directory.

// Read the project folder to detect the Runtime environment.

// Detect the FrameworkSpec required.
import { Runtime, FileSystem, RuntimeMatch } from "./types";
import { NodejsRuntime } from "./runtimes/NodejsRuntime";

/**
 *
 */
export function interpolate(template: string | null, vars?: Record<string, string>): string | null {
  if (!template) {
    return template;
  }
  return template.replaceAll(/\${(.*)}/g, (_, varName: string) => vars?.[varName] || "");
}
const allRuntimes: Runtime[] = [new NodejsRuntime()];

/**
 *
 */
export async function find(fs: FileSystem): Promise<RuntimeMatch | null> {
  const matches = await Promise.all(allRuntimes.map((runtime) => runtime.match(fs)));
  let match: RuntimeMatch | null = null;
  for (const res of matches) {
    if (!res) {
      continue;
    }
    if (match) {
      throw new Error("More than one runtime matched codebase");
    }
    match = res;
  }
  return match;
}

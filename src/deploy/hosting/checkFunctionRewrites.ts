import { list } from "../../gcp/cloudfunctions";

/**
 * Detect function rewrites that point to non-existent Cloud Functions in `us-central1` in the project.
 * @param projectId Project to check.
 * @param functionNames Array of function names to check.
 */
export async function checkFunctionRewrites(
  projectId: string,
  functionNames: string[]
): Promise<{ found: string[]; missing: string[]; passed: boolean }> {
  const listResult = await list(projectId, "us-central1");
  const foundNames: string[] = listResult
    // look only for https functions
    .filter((fn: { httpsTrigger?: {} }) => typeof fn.httpsTrigger === "object")
    .map((fn: { functionName: string }) => fn.functionName);

  const missing: string[] = [];
  const found: string[] = [];

  functionNames.forEach((name) =>
    foundNames.includes(name) ? found.push(name) : missing.push(name)
  );

  return { missing, found, passed: missing.length === 0 };
}

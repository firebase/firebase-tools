import * as backend from "../deploy/functions/backend";
import { previews } from "../previews";
import { Context } from "../deploy/functions/args";

/**
 * Lists all functions of the Firebase project in order
 * @param context the Context of the project
 * @returns a mapping that contains an array of {@link FunctionSpec} in order under the 'functions' key
 */
export async function listFunctions(
  context: Context
): Promise<{ functions: backend.FunctionSpec[] }> {
  const functionSpecs = (await backend.existingBackend(context, true)).cloudFunctions;
  functionSpecs.sort(backend.compareFunctions);
  return { functions: functionSpecs };
}

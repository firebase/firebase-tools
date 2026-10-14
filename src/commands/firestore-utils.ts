import { FirebaseError } from "../error";

/**
 * Given an operation name, which may be a short name or full name,
 * it returns the short name.
 *
 * It's common for users to use full names such as:
 * `projects/foo/databases/bar/operations/operation_1`
 * and short names such as `operation_1` interchangeably.
 * If the input is a short name (with no '/'), it returns the name as-is.
 * If the input is a full name, it returns the short name.
 * If the input is not a valid operation name it throws an exception.
 * @param operationName the operation name
 */
export function getShortOperationName(operationName: string): string {
  let opName = operationName;
  if (operationName.includes("/operations/")) {
    // Since operationName includes `/operations/`, it is guaranteed
    // that the `split()` will result in a list of 2 or more elements.
    opName = operationName.split("/operations/")[1];
  }

  if (opName.length === 0 || opName.includes("/")) {
    throw new FirebaseError(`"${operationName}" is not a valid operation name.`);
  }

  return opName;
}

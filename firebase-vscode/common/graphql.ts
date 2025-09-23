import { ExecutionResult, GraphQLError } from "graphql";

/** Asserts that an unknown object is a {@link ExecutionResult} */
export function assertExecutionResult(
  response: any
): asserts response is ExecutionResult {
  if (!response) {
    throw new Error(`Expected ExecutionResult but got ${response}`);
  }

  const type = typeof response;
  if (type !== "object") {
    throw new Error(`Expected ExecutionResult but got ${type}`);
  }

  const { data, errors } = response;
  if (!data && !errors) {
    throw new Error(
      `Expected ExecutionResult to have either "data" or "errors" set but none found`
    );
  }

  if (errors) {
    if (!Array.isArray(errors)) {
      throw new Error(
        `Expected errors to be an array but got ${typeof errors}`
      );
    }
    for (const error of errors) {
      assertGraphQLError(error);
    }
  }
}

export function isExecutionResult(response: any): response is ExecutionResult {
  try {
    assertExecutionResult(response);
    return true;
  } catch {
    return false;
  }
}

/** Asserts that an unknown object is a {@link GraphQLError} */
export function assertGraphQLError(
  error: unknown
): asserts error is GraphQLError {
  if (!error) {
    throw new Error(`Expected GraphQLError but got ${error}`);
  }

  const type = typeof error;
  if (type !== "object") {
    throw new Error(`Expected GraphQLError but got ${type}`);
  }

  const { message } = error as GraphQLError;
  if (typeof message !== "string") {
    throw new Error(
      `Expected GraphQLError to have "message" set but got ${typeof message}`
    );
  }
}

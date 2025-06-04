/** An error thrown before the GraphQL operation could complete.
 *
 * This could include HTTP errors or JSON parsing errors.
 */
export class DataConnectError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
  }
}

/** Encode an error into a {@link SerializedError} */
export function toSerializedError(error: Error): SerializedError {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause:
      error.cause instanceof Error ? toSerializedError(error.cause) : undefined,
  };
}

/** An error object that can be sent across webview boundaries */
export interface SerializedError {
  name?: string;
  message: string;
  stack?: string;
  cause?: SerializedError;
}

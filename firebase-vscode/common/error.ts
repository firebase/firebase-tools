/** An error response returned when something went very wrong with the request.
 *
 * For example, this may be returned if the request did not send a valid JSON object.
 */
export interface FirematErrorMeta {
  code: number;
  message: string;
  details?: unknown[];
}

/** Verified that an unknown object is a {@link FirematErrorMeta} */
export function isFirematErrorMeta(error: any): error is FirematErrorMeta {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const { code, message, details } = error;
  if (typeof code !== "number") {
    return false;
  }
  if (message && typeof message !== "string") {
    return false;
  }
  if (details && !Array.isArray(details)) {
    return false;
  }

  return true;
}

/** An error thrown before the GraphQL operation could complete.
 *
 * This could include HTTP errors or JSON parsing errors.
 */
export class FirematError extends Error {
  constructor(message: string, body: unknown, cause?: unknown) {
    super(message, { cause });
    this.body = body;
  }

  /** The decoded response body.
   *
   * May be an instance of {@link FirematErrorMeta}.
   * This can be checked with {@link isFirebaseServerError}.
   */
  readonly body: unknown;
}

/** Encode an error into a {@link SerializedError} */
export function toSerializedError(error: Error): SerializedError {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    body: error instanceof FirematError ? error.body : undefined,
    cause: error.cause instanceof Error ? toSerializedError(error.cause) : undefined,
  };
}

/** An error object that can be sent across webview boundaries */
export interface SerializedError {
  name?: string;
  message: string;
  stack?: string;
  body?: unknown;
  cause?: SerializedError;
}

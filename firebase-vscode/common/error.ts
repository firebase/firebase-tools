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
export function isFirematServerError(error: any): error is FirematErrorMeta {
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

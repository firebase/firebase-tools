/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { ExtendableError } from "exegesis/lib/errors";

// https://cloud.google.com/apis/design/errors#http_mapping
// https://cloud.google.com/identity-platform/docs/use-rest-api#handling_errors

export class ApiError extends ExtendableError {
  readonly errors: ErrorItem[];

  constructor(
    public readonly code: number,
    public readonly status: string | undefined,
    message: string,
    reasonOrErrors: string | ErrorItem[]
  ) {
    super(message);
    this.code = code;
    this.status = status;
    if (typeof reasonOrErrors === "string") {
      this.errors = [{ message, reason: reasonOrErrors }];
    } else {
      this.errors = reasonOrErrors;
    }
  }

  toJSON(): object {
    return { code: this.code, message: this.message, errors: this.errors, status: this.status };
  }
}

export interface ErrorItem {
  message: string;
  reason: string;
  domain?: string;
  location?: string;
  locationType?: string;
}

export class BadRequestError extends ApiError {
  constructor(
    message: string,
    reasonOrErrors: string | ErrorItem[] = [{ message, reason: "invalid", domain: "global" }]
  ) {
    super(400, undefined, message, reasonOrErrors);
  }
}

// Errors below are a subset of the codes below. Add as needed.
// https://cloud.google.com/apis/design/errors#handling_errors

export class InvalidArgumentError extends ApiError {
  constructor(
    message: string,
    reasonOrErrors: string | ErrorItem[] = [{ message, reason: "invalid", domain: "global" }]
  ) {
    super(400, "INVALID_ARGUMENT", message, reasonOrErrors);
  }
}

export class UnauthenticatedError extends ApiError {
  constructor(message: string, reasonOrErrors: string | ErrorItem[]) {
    super(401, "UNAUTHENTICATED", message, reasonOrErrors);
  }
}

export class PermissionDeniedError extends ApiError {
  constructor(
    message: string,
    reasonOrErrors: string | ErrorItem[] = [{ message, reason: "forbidden", domain: "global" }]
  ) {
    super(403, "PERMISSION_DENIED", message, reasonOrErrors);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Not Found", reasonOrErrors: string | ErrorItem[] = "notFound") {
    super(404, "NOT_FOUND", message, reasonOrErrors);
  }
}

export class UnknownError extends ApiError {
  constructor(message: string, reason: string) {
    super(500, "UNKNOWN", message, reason);
  }
}

export class InternalError extends ApiError {
  constructor(message: string, reason: string) {
    super(500, "INTERNAL", message, reason);
  }
}

export class NotImplementedError extends ApiError {
  constructor(message: string, reason = "unimplemented") {
    super(501, "NOT_IMPLEMENTED", message, reason);
  }
}

/**
 * Asserts that a condition is truthy, or throw BadRequestError with message.
 * @param assertion the condition to be asserted truthy.
 * @param error the error message to be thrown if assertion is falsy.
 */
export function assert(assertion: unknown, error: string): asserts assertion {
  if (!assertion) {
    throw new BadRequestError(error);
  }
}

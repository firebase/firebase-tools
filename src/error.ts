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

import { defaultTo } from "lodash";

interface FirebaseErrorOptions {
  children?: unknown[];
  context?: unknown;
  exit?: number;
  original?: Error;
  status?: number;
}

const DEFAULT_CHILDREN: NonNullable<FirebaseErrorOptions["children"]> = [];
const DEFAULT_EXIT: NonNullable<FirebaseErrorOptions["exit"]> = 1;
const DEFAULT_STATUS: NonNullable<FirebaseErrorOptions["status"]> = 500;

export class FirebaseError extends Error {
  readonly children: unknown[];
  readonly context: unknown | undefined;
  readonly exit: number;
  readonly message: string;
  readonly name = "FirebaseError";
  readonly original: Error | undefined;
  readonly status: number;

  constructor(message: string, options: FirebaseErrorOptions = {}) {
    super();

    this.children = defaultTo(options.children, DEFAULT_CHILDREN);
    this.context = options.context;
    this.exit = defaultTo(options.exit, DEFAULT_EXIT);
    this.message = message;
    this.original = options.original;
    this.status = defaultTo(options.status, DEFAULT_STATUS);
  }
}

/**
 * Checks if a FirebaseError is caused by attempting something
 * that requires billing enabled while billing is not enabled.
 */
export function isBillingError(e: {
  context?: {
    body?: {
      error?: {
        details?: {
          type: string;
          reason?: string;
          violations?: { type: string }[];
        }[];
      };
    };
  };
}): boolean {
  return !!e.context?.body?.error?.details?.find((d) => {
    return (
      d.violations?.find((v) => v.type === "serviceusage/billing-enabled") ||
      d.reason === "UREQ_PROJECT_BILLING_NOT_FOUND"
    );
  });
}

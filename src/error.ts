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
 * Safely gets an error message from an unknown object
 * @param err an unknown error type
 * @param defaultMsg an optional message to return if the err is not Error or string
 * @return An error string
 */
export function getErrMsg(err: unknown, defaultMsg?: string): string {
  if (err instanceof Error) {
    return err.message;
  } else if (typeof err === "string") {
    return err;
  } else if (defaultMsg) {
    return defaultMsg;
  }
  return JSON.stringify(err);
}

/**
 * Safely gets an error stack (or error message if no stack is available)
 * from an unknown object
 * @param err The potential error object
 * @return a string representing the error stack or the error message.
 */
export function getErrStack(err: unknown): string {
  if (err instanceof Error) {
    return err.stack || err.message;
  }
  return getErrMsg(err);
}

/**
 * A typeguard for objects
 * @param value The value to check
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Safely gets a status from an unknown object if it has one.
 * @param err The error to get the status of
 * @param defaultStatus a default status if there is none
 * @return the err status, a default status or DEFAULT_STATUS
 */
export function getErrStatus(err: unknown, defaultStatus?: number): number {
  if (isObject(err) && err.status && typeof err.status === "number") {
    return err.status;
  }

  return defaultStatus || DEFAULT_STATUS;
}

/**
 * Safely gets an error object from an unknown object
 * @param err The error to get an Error for.
 * @return an Error object
 */
export function getError(err: unknown): Error {
  if (err instanceof Error) {
    return err;
  }
  return Error(getErrMsg(err));
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

/**
 * Checks whether an unknown object (such as an error) has a message field
 */
export const hasMessage = (e: any): e is { message: string } => !!e?.message;

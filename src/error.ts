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

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

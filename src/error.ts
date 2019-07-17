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

export class FirebaseError extends Error implements FirebaseErrorOptions {
  readonly children: unknown[];
  readonly context: unknown | undefined;
  readonly exit: number;
  readonly message: string;
  readonly name = "FirebaseError";
  readonly original: Error | undefined;
  readonly status: number;

  constructor(
    message: string,
    {
      children = DEFAULT_CHILDREN,
      context,
      exit = DEFAULT_EXIT,
      original,
      status = DEFAULT_STATUS,
    }: FirebaseErrorOptions = {}
  ) {
    super();

    this.children = children;
    this.context = context;
    this.exit = exit;
    this.message = message;
    this.original = original;
    this.status = status;
  }
}

import { Options } from "../../../options";
import * as backend from "../backend";
import * as args from "../args";
import * as node from "./node";
import * as validate from "../validate";
import { FirebaseError } from "../../../error";

/** Supported runtimes for new Cloud Functions. */
const RUNTIMES: string[] = ["nodejs10", "nodejs12", "nodejs14"];
export type Runtime = typeof RUNTIMES[number];

/** Runtimes that can be found in existing backends but not used for new functions. */
const DEPRECATED_RUNTIMES = ["nodejs6", "nodejs8"];
export type DeprecatedRuntime = typeof DEPRECATED_RUNTIMES[number];

/** Type deduction helper for a runtime string */
export function isDeprecatedRuntime(runtime: string): runtime is DeprecatedRuntime {
  return DEPRECATED_RUNTIMES.includes(runtime);
}

/** Type deduction helper for a runtime string. */
export function isValidRuntime(runtime: string): runtime is Runtime {
  return RUNTIMES.includes(runtime);
}

const MESSAGE_FRIENDLY_RUNTIMES: Record<Runtime | DeprecatedRuntime, string> = {
  nodejs6: "Node.js 6 (Deprecated)",
  nodejs8: "Node.js 8 (Deprecated)",
  nodejs10: "Node.js 10",
  nodejs12: "Node.js 12",
  nodejs14: "Node.js 14",
};

/**
 * Returns a friendly string denoting the chosen runtime: Node.js 8 for nodejs 8
 * for example. If no friendly name for runtime is found, returns back the raw runtime.
 * @param runtime name of runtime in raw format, ie, "nodejs8" or "nodejs10"
 * @return A human-friendly string describing the runtime.
 */
export function getHumanFriendlyRuntimeName(runtime: Runtime | DeprecatedRuntime): string {
  return MESSAGE_FRIENDLY_RUNTIMES[runtime] || runtime;
}

/**
 * RuntimeDelegate is a language-agnostic strategy for managing
 * customer source.
 */
export interface RuntimeDelegate {
  /** A friendly name for the runtime; used for debug purposes */
  name: string;

  /**
   * The name of the specific runtime of this source code.
   * This will often differ from `name` because `name` will be
   * version-free but this will include a specific runtime for
   * the GCF API.
   */
  runtime: Runtime;

  /**
   * Validate makes sure the customers' code is actually viable.
   * This includes checks like making sure a package.json file is
   * well formed.
   * This is a first line of defense for static analysis and does
   * not include any build or runtime errors in the customer's code.
   */
  validate(): Promise<void>;

  /**
   * Perform any steps necessary to build a customer's code. This can
   * include transpiling TypeScript, calling a Go compiler, or running
   * docker build. This step will be run before a function is deployed.
   */
  build(): Promise<void>;

  /**
   * Perform any steps necessary to continuously build a customer's code.
   * This is for languages like TypeScript which have a "watch" feature.
   * Returns a cancel function.
   */
  watch(): Promise<() => Promise<void>>;

  /**
   * Inspect the customer's source for the backend spec it describes.
   */
  // TODO: Once discoverSpec supports/is all an HTTP contract, we should find a way
  // for this to reuse or keep alive an HTTP server. This will speed up the emulator
  // by only loading customer code once. This part of the interface will be easier
  // to figure out as we go.
  discoverSpec(
    configValues: backend.RuntimeConfigValues,
    envs: backend.EnvironmentVariables
  ): Promise<backend.Backend>;
}

type Factory = (context: args.Context, options: Options) => Promise<RuntimeDelegate | undefined>;
const factories: Factory[] = [node.tryCreateDelegate];

export async function getRuntimeDelegate(
  context: args.Context,
  options: Options
): Promise<RuntimeDelegate> {
  const sourceDirName = options.config.get("functions.source") as string;
  if (!sourceDirName) {
    throw new FirebaseError(
      `No functions code detected at default location (./functions), and no functions.source defined in firebase.json`
    );
  }
  validate.functionsDirectoryExists(options, sourceDirName);

  for (const factory of factories) {
    const delegate = await factory(context, options);
    if (delegate) {
      return delegate;
    }
  }

  throw new FirebaseError(
    "Could not detect language for functions at",
    options.config.get("functions.source")
  );
}

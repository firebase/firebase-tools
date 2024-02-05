import * as backend from "../backend";
import * as build from "../build";
import * as node from "./node";
import * as python from "./python";
import * as validate from "../validate";
import { FirebaseError } from "../../../error";

/** Supported runtimes for new Cloud Functions. */
const RUNTIMES: string[] = [
  "nodejs10",
  "nodejs12",
  "nodejs14",
  "nodejs16",
  "nodejs18",
  "nodejs20",
  "python310",
  "python311",
];
// Experimental runtimes are part of the Runtime type, but are in a
// different list to help guard against some day accidentally iterating over
// and printing a hidden runtime to the user.
const EXPERIMENTAL_RUNTIMES: string[] = [];
export type Runtime = (typeof RUNTIMES)[number] | (typeof EXPERIMENTAL_RUNTIMES)[number];

/** Runtimes that can be found in existing backends but not used for new functions. */
const DEPRECATED_RUNTIMES = ["nodejs6", "nodejs8"];
export type DeprecatedRuntime = (typeof DEPRECATED_RUNTIMES)[number];

/** Type deduction helper for a runtime string */
export function isDeprecatedRuntime(runtime: string): runtime is DeprecatedRuntime {
  return DEPRECATED_RUNTIMES.includes(runtime);
}

/** Type deduction helper for a runtime string. */
export function isValidRuntime(runtime: string): runtime is Runtime {
  return RUNTIMES.includes(runtime) || EXPERIMENTAL_RUNTIMES.includes(runtime);
}

const MESSAGE_FRIENDLY_RUNTIMES: Record<Runtime | DeprecatedRuntime, string> = {
  nodejs6: "Node.js 6 (Deprecated)",
  nodejs8: "Node.js 8 (Deprecated)",
  nodejs10: "Node.js 10",
  nodejs12: "Node.js 12",
  nodejs14: "Node.js 14",
  nodejs16: "Node.js 16",
  nodejs18: "Node.js 18",
  nodejs20: "Node.js 20",
  python310: "Python 3.10",
  python311: "Python 3.11",
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
   * Path to the bin used to run the source code.
   */
  bin: string;

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
  discoverBuild(
    configValues: backend.RuntimeConfigValues,
    envs: backend.EnvironmentVariables,
  ): Promise<build.Build>;
}

export interface DelegateContext {
  projectId: string;
  // Absolute path of the Firebase project directory.
  projectDir: string;
  // Absolute path of the source directory.
  sourceDir: string;
  runtime?: string;
}

type Factory = (context: DelegateContext) => Promise<RuntimeDelegate | undefined>;
const factories: Factory[] = [node.tryCreateDelegate, python.tryCreateDelegate];

/**
 *
 */
export async function getRuntimeDelegate(context: DelegateContext): Promise<RuntimeDelegate> {
  const { projectDir, sourceDir, runtime } = context;
  validate.functionsDirectoryExists(sourceDir, projectDir);

  // There isn't currently an easy way to map from runtime name to a delegate, but we can at least guarantee
  // that any explicit runtime from firebase.json is valid
  if (runtime && !isValidRuntime(runtime)) {
    throw new FirebaseError(`Cannot deploy function with runtime ${runtime}`);
  }

  for (const factory of factories) {
    const delegate = await factory(context);
    if (delegate) {
      return delegate;
    }
  }

  throw new FirebaseError(`Could not detect language for functions at ${sourceDir}`);
}

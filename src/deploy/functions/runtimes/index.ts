import * as backend from "../backend";
import * as build from "../build";
import * as node from "./node";
import * as python from "./python";
import * as validate from "../validate";
import { FirebaseError } from "../../../error";
import * as supported from "./supported";

/**
 * RuntimeDelegate is a language-agnostic strategy for managing
 * customer source.
 */
export interface RuntimeDelegate {
  /** The language for the runtime; used for debug purposes */
  language: supported.Language;

  /**
   * The name of the specific runtime of this source code.
   */
  runtime: supported.Runtime;

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
  runtime?: supported.Runtime;
}

type Factory = (context: DelegateContext) => Promise<RuntimeDelegate | undefined>;
const factories: Factory[] = [node.tryCreateDelegate, python.tryCreateDelegate];

/**
 * Gets the delegate object responsible for discovering, building, and hosting
 * code of a given language.
 */
export async function getRuntimeDelegate(context: DelegateContext): Promise<RuntimeDelegate> {
  const { projectDir, sourceDir, runtime } = context;

  if (runtime && !supported.isRuntime(runtime)) {
    throw new FirebaseError(
      `firebase.json specifies invalid runtime ${runtime as string} for directory ${sourceDir}`,
    );
  }
  validate.functionsDirectoryExists(sourceDir, projectDir);

  for (const factory of factories) {
    const delegate = await factory(context);
    if (delegate) {
      return delegate;
    }
  }

  throw new FirebaseError(`Could not detect runtime for functions at ${sourceDir}`);
}

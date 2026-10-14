import { FirebaseConfig } from "../firebaseConfig";
import { assertImplements } from "../metaprogramming";
import { Options } from "../options";
import { HostingResolved } from "./config";

/**
 * The set of fields that the Hosting codebase needs from Options.
 * It is preferable that all codebases use this technique so that they keep
 * strong typing in their codebase but limit the codebase to have less to mock.
 */
export interface HostingOptions {
  project?: string;
  site?: string;
  config: {
    src: FirebaseConfig;
  };
  rc: {
    requireTarget(project: string, type: string, name: string): string[];
  };
  cwd?: string;
  configPath?: string;
  only?: string;
  except?: string;
  normalizedHostingConfig?: Array<HostingResolved>;
  expires?: `${number}${"h" | "d" | "m"}`;
}

// This line caues a compile-time error if HostingOptions has a field that is
// missing in Options or incompatible with the type in Options.
assertImplements<Options, HostingOptions>();

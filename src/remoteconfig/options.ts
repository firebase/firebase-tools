import { Options } from "../options";
import { assertImplements } from "../metaprogramming";

/**
 * The set of fields that the Remote Config codebase needs from Options.
 * This helps keep the codebase strongly typed and limits what needs to be mocked for tests.
 */
export interface RemoteConfigOptions extends Options {
  // We can't know the type of options.* since it comes from Commander,
  // so we need to specify the types of the options we are using.
  pageSize?: string;
  pageToken?: string;
  filter?: string;
}

// This line will cause a compile-time error if RemoteConfigOptions has a field
// that is missing in the base Options interface or has an incompatible type.
assertImplements<Options, RemoteConfigOptions>();

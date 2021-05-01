import { FirebaseError } from "../../../error";
import { logger } from "../../../logger";
import * as backend from "../backend";
import * as args from "../args";
import * as jsTriggerParsing from "./jsexports/parseTriggers";

type BackendDiscoveryStrategy = (
  context: args.Context,
  options: args.Options,
  runtimeConfig: backend.RuntimeConfigValues
) => Promise<backend.Backend>;

type UseBackendDiscoveryStrategy = (context: args.Context) => Promise<boolean>;

type Strategy = {
  name: string;
  useStrategy: UseBackendDiscoveryStrategy;
  discoverBackend: BackendDiscoveryStrategy;
};

const STRATEGIES: Strategy[] = [
  {
    name: "parseJSExports",
    useStrategy: jsTriggerParsing.useStrategy,
    discoverBackend: jsTriggerParsing.discoverBackend,
  },
];

// TODO(inlined): Replace runtimeConfigValues with ENV variables.
// TODO(inlined): Parse the Runtime within this method instead of before it. We need this to support other languages.
export async function discoverBackendSpec(
  context: args.Context,
  options: args.Options,
  runtimeConfigValues: backend.RuntimeConfigValues
): Promise<backend.Backend> {
  let strategy: Strategy;
  for (const testStrategy of STRATEGIES) {
    if (await testStrategy.useStrategy(context)) {
      strategy = testStrategy;
      break;
    }
  }

  if (strategy) {
    logger.debug("Analyizing backend with strategy", strategy.name);
  } else {
    throw new FirebaseError("Cannot determine how to analyze backend");
  }
  return strategy.discoverBackend(context, options, runtimeConfigValues);
}

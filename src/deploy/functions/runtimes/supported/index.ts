import { FirebaseError } from "../../../../error";
import * as utils from "../../../../utils";
import { Language, RUNTIMES, Runtime, RuntimeOf } from "./types";

export * from "./types";

/** Type deduction helper for a runtime string. */
export function isRuntime(maybe: string): maybe is Runtime {
  return maybe in RUNTIMES;
}

/** Type deduction helper to narrow a runtime to a language. */
export function runtimeIsLanguage<L extends Language>(
  runtime: Runtime,
  language: L,
): runtime is Runtime & RuntimeOf<L> {
  return runtime.startsWith(language);
}

/**
 * Find the latest supported Runtime for a Language.
 */
export function latest<T extends Language>(
  language: T,
  runtimes: Runtime[] = Object.keys(RUNTIMES) as Runtime[],
): RuntimeOf<T> & Runtime {
  const sorted = runtimes
    .filter((s) => runtimeIsLanguage(s, language))
    // node8 is less than node20
    .sort((left, right) => {
      const leftVersion = +left.substring(language.length);
      const rightVersion = +right.substring(language.length);
      if (isNaN(leftVersion) || isNaN(rightVersion)) {
        throw new FirebaseError("Internal error. Runtime or language names are malformed", {
          exit: 1,
        });
      }
      return leftVersion - rightVersion;
    });
  const latest = utils.last(sorted);
  if (!latest) {
    throw new FirebaseError(
      `Internal error trying to find the latest supported runtime for ${language}`,
      { exit: 1 },
    );
  }
  return latest as RuntimeOf<T> & Runtime;
}

/**
 * Whether a runtime is decommissioned.
 * Accepts now as a parameter to increase testability
 */
export function isDecommissioned(runtime: Runtime, now: Date = new Date()): boolean {
  const cutoff = new Date(RUNTIMES[runtime].decommissionDate);
  return cutoff < now;
}

/**
 * Prints a warning if a runtime is in or nearing its deprecation time. Throws
 * an error if the runtime is decommissioned. Accepts time as a parameter to
 * increase testability.
 */
export function guardVersionSupport(runtime: Runtime, now: Date = new Date()): void {
  const { deprecationDate, decommissionDate } = RUNTIMES[runtime];

  const decommission = new Date(decommissionDate);
  if (now >= decommission) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    throw new FirebaseError(
      `Runtime ${RUNTIMES[runtime].friendly} was decommissioned on ${decommissionDate}. To deploy ` +
        "you must first upgrade your runtime version.",
      { exit: 1 },
    );
  }

  const deprecation = new Date(deprecationDate);
  if (now >= deprecation) {
    utils.logLabeledWarning(
      "functions",
      `Runtime ${RUNTIMES[runtime].friendly} was deprecated on ${deprecationDate} and will be ` +
        `decommissioned on ${decommissionDate}, after which you will not be able ` +
        "to deploy without upgrading. Consider upgrading now to avoid disruption. See " +
        "https://cloud.google.com/functions/docs/runtime-support for full " +
        "details on the lifecycle policy",
    );
    return;
  }

  // Subtract 90d (90 * milliseconds per day) to get warning period
  const warning = new Date(deprecation.getTime() - 90 * 24 * 60 * 60 * 1000);
  if (now >= warning) {
    utils.logLabeledWarning(
      "functions",
      `Runtime ${RUNTIMES[runtime].friendly} will be deprecated on ${deprecationDate} and will be ` +
        `decommissioned on ${decommissionDate}, after which you will not be able ` +
        "to deploy without upgrading. Consider upgrading now to avoid disruption. See " +
        "https://cloud.google.com/functions/docs/runtime-support for full " +
        "details on the lifecycle policy",
    );
  }
}

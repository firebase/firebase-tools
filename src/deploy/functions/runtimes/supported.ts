import { FirebaseError } from "../../../error";
import * as utils from "../../../utils";

// N.B. The status "deprecated" and "decommmissioned" is informational only.
// The deprecationDate and decommmissionDate are the canonical values.
// Updating the definition to "decommissioned", however, will omit the runtime
// name from firebaseConfig's json schema.
export type RuntimeStatus = "experimental" | "beta" | "GA" | "deprecated" | "decommissioned";

type Day = `${number}-${number}-${number}`;

/** Supported languages. All Runtime are a language + version. */
export type Language = "nodejs" | "python";

/**
 * Helper type that is more friendlier than string interpolation everywhere.
 * Unfortunately, as Runtime has literal numbers and RuntimeOf accepts any
 * number, RuntimeOf<L> and Runtime must be intersected. It might help
 * readability to rename Runtime to KnownRuntime so that it reads better to see
 * KnownRuntime & RuntimeOf<"python">.
 */
export type RuntimeOf<T extends Language> = `${T}${number}`;

export interface RuntimeData {
  friendly: string;
  status: RuntimeStatus;
  deprecationDate: Day;
  decommissionDate: Day;
}

// We can neither use the "satisfies" keyword nor the metaprogramming library
// in this file to ensure RUNTIMES implements the right interfaces, so we must
// use the copied assertImplements below. Some day these hacks will go away.
function runtimes<T extends Record<RuntimeOf<Language>, RuntimeData>>(r: T): T {
  return r;
}

export const RUNTIMES = runtimes({
  nodejs6: {
    friendly: "Node.js 6",
    status: "decommissioned",
    deprecationDate: "2019-04-17",
    decommissionDate: "2020-08-01",
  },
  nodejs8: {
    friendly: "Node.js 8",
    status: "decommissioned",
    deprecationDate: "2020-06-05",
    decommissionDate: "2021-02-01",
  },
  nodejs10: {
    friendly: "Node.js 10",
    status: "GA",
    deprecationDate: "2024-01-30",
    decommissionDate: "2025-01-30",
  },
  nodejs12: {
    friendly: "Node.js 12",
    status: "GA",
    deprecationDate: "2024-01-30",
    decommissionDate: "2025-01-30",
  },
  nodejs14: {
    friendly: "Node.js 14",
    status: "GA",
    deprecationDate: "2024-01-30",
    decommissionDate: "2025-01-30",
  },
  nodejs16: {
    friendly: "Node.js 16",
    status: "GA",
    deprecationDate: "2024-01-30",
    decommissionDate: "2025-01-30",
  },
  nodejs18: {
    friendly: "Node.js 18",
    status: "GA",
    deprecationDate: "2025-04-30",
    decommissionDate: "2025-10-31",
  },
  nodejs20: {
    friendly: "Node.js 20",
    status: "GA",
    deprecationDate: "2026-04-30",
    decommissionDate: "2026-10-31",
  },
  python310: {
    friendly: "Python 3.10",
    status: "GA",
    deprecationDate: "2026-10-04",
    decommissionDate: "2027-04-30",
  },
  python311: {
    friendly: "Python 3.11",
    status: "GA",
    deprecationDate: "2027-10-24",
    decommissionDate: "2028-04-30",
  },
  python312: {
    friendly: "Python 3.12",
    status: "GA",
    deprecationDate: "2028-10-02",
    decommissionDate: "2029-04-30",
  },
});

export type Runtime = keyof typeof RUNTIMES & RuntimeOf<Language>;

export type DecommissionedRuntime = {
  [R in keyof typeof RUNTIMES]: (typeof RUNTIMES)[R] extends { status: "decommissioned" }
    ? R
    : never;
}[keyof typeof RUNTIMES];

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

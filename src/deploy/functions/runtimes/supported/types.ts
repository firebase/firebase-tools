// N.B. This file contains no imports so that it can't break the very fragile firebaseConfig.ts

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
  nodejs22: {
    friendly: "Node.js 22",
    status: "GA",
    deprecationDate: "2027-04-30",
    decommissionDate: "2027-10-31",
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

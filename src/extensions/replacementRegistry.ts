import { logger } from "../logger";
import * as replacementsData from "./replacements.json";

export type ReplacementStatus =
  | "REPLACEMENT_AVAILABLE"
  | "CONFIRMED_NO_REPLACEMENT"
  | "PENDING_PUBLISHER";

export type ReplacementInfo =
  | {
      status: "REPLACEMENT_AVAILABLE";
      npmPackage: string;
      extensionRepositoryUrl: string;
    }
  | {
      status: "CONFIRMED_NO_REPLACEMENT";
      npmPackage?: never;
      extensionRepositoryUrl: string;
    }
  | {
      status: "PENDING_PUBLISHER";
      npmPackage?: never;
      extensionRepositoryUrl: string;
    };

export interface ReplacementRegistrySchema {
  replacements: Record<string, ReplacementInfo>;
}

const DECOMMISSION_DATE_STR = "March 31, 2027";

// The source of truth for Function Kit replacement packages on GitHub main.
export const REPLACEMENTS_GITHUB_RAW_URL =
  "https://raw.githubusercontent.com/firebase/firebase-tools/main/src/extensions/replacements.json";

// Timeout guard for fetching the remote catalog.
export const NETWORK_TIMEOUT_MS = 2000;

/**
 * Loads the replacements registry from GitHub raw.
 *
 * To ensure the CLI stays responsive and fully functional offline, any network
 * failure, timeout, non-200 HTTP status, or parsing error triggers an immediate
 * and silent fallback to the local bundled replacements.json file.
 */
export async function getReplacementsRegistry(): Promise<ReplacementRegistrySchema> {
  // AbortController cancels the outbound socket if the remote server hangs.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);

  try {
    const res = await fetch(REPLACEMENTS_GITHUB_RAW_URL, { signal: controller.signal });

    if (res.ok) {
      const data = (await res.json()) as ReplacementRegistrySchema;
      // Basic sanity check to ensure the payload conforms to the expected schema.
      if (data?.replacements && typeof data.replacements === "object") {
        return data;
      }
    }
  } catch (err) {
    // Failures (offline, DNS, timeout) are non-fatal; log to debug and proceed to fallback.
    logger.debug(`Failed to fetch fresh replacements catalog from GitHub: ${String(err)}`);
  } finally {
    clearTimeout(timeoutId);
  }

  // Gracefully fallback to the bundled static snapshot shipped inside the CLI.
  return replacementsData as ReplacementRegistrySchema;
}

/**
 * Returns the replacement info for a given extension reference (e.g. "firebase/firestore-send-email").
 * Accepts an optional dynamic registry, defaulting to the bundled replacements.json.
 */
export function getExtensionReplacement(
  extensionRef: string,
  registry: ReplacementRegistrySchema = replacementsData as ReplacementRegistrySchema,
): ReplacementInfo | undefined {
  if (!extensionRef) {
    return undefined;
  }
  return registry.replacements?.[extensionRef];
}

/**
 * Resolves the replacement npm package name for an extension reference directly from the registry.
 *
 * In replacements.json, all official 1P and partner extensions use fully-scoped references
 * (e.g. "firebase/storage-resize-images"), allowing for a direct O(1) dictionary lookup.
 *
 * Returns the package name string only if status is "REPLACEMENT_AVAILABLE". Returns undefined
 * for unmapped extensions, "CONFIRMED_NO_REPLACEMENT", or "PENDING_PUBLISHER".
 */
export function getReplacementPackageName(
  extensionRef: string,
  registry: ReplacementRegistrySchema = replacementsData as ReplacementRegistrySchema,
): string | undefined {
  if (!extensionRef) {
    return undefined;
  }
  const entry = registry.replacements?.[extensionRef];
  if (entry?.status === "REPLACEMENT_AVAILABLE" && entry.npmPackage) {
    return entry.npmPackage;
  }
  return undefined;
}

/**
 * Formats a clean deprecation notice string for CLI display.
 */
export function getDeprecationWarningMessage(
  extensionRef: string,
  registry?: ReplacementRegistrySchema,
): string | undefined {
  const replacement = getExtensionReplacement(extensionRef, registry);
  if (!replacement) {
    return undefined;
  }

  switch (replacement.status) {
    case "REPLACEMENT_AVAILABLE":
      return (
        `Extension '${extensionRef}' is deprecated and will be decommissioned on ${DECOMMISSION_DATE_STR}.\n` +
        `  Recommended replacement: ${replacement.npmPackage}`
      );
    case "CONFIRMED_NO_REPLACEMENT":
      return (
        `Extension '${extensionRef}' is deprecated and will be decommissioned on ${DECOMMISSION_DATE_STR}.\n` +
        `  Note: No npm package replacement is planned for this extension.`
      );
    case "PENDING_PUBLISHER":
      return (
        `Extension '${extensionRef}' is deprecated and will be decommissioned on ${DECOMMISSION_DATE_STR}.\n` +
        `  A replacement package has not yet been announced by the publisher.`
      );
  }
}

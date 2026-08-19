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
const registry = replacementsData as ReplacementRegistrySchema;

/**
 * Returns the replacement info for a given extension reference (e.g. "firebase/firestore-send-email").
 */
export function getExtensionReplacement(extensionRef: string): ReplacementInfo | undefined {
  if (!extensionRef) {
    return undefined;
  }
  return registry.replacements?.[extensionRef];
}

/**
 * Formats a clean deprecation notice string for CLI display.
 */
export function getDeprecationWarningMessage(extensionRef: string): string | undefined {
  const replacement = getExtensionReplacement(extensionRef);
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

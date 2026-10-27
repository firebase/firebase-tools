export const FUNCTION_KITS_DIR = "function-kits";

/**
 * Sanitizes a raw name into a valid kit identifier (lowercase alphanumeric, underscores, and hyphens, max 40 chars).
 */
export function sanitizeToKitId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

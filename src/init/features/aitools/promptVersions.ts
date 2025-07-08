export interface PromptVersion {
  name: string;
  version: string;
  feature?: string;
}

export interface PromptVersionMap {
  [key: string]: string;
}

/**
 * Current versions of all Firebase prompts
 * Update these when prompt files are modified
 */
export const CURRENT_PROMPT_VERSIONS: PromptVersionMap = {
  "firebase_base": "0.0.1",
  "firebase_functions": "0.0.1",
  // Future prompts:
  // "firebase_firestore": "0.0.1",
  // "firebase_hosting": "0.0.1",
  // "firebase_storage": "0.0.1",
};

/**
 * Extract version from prompt content using XML tags
 */
export function extractPromptVersion(content: string, promptType: string): string | null {
  const regex = new RegExp(`<${promptType}_context\\s+version="([^"]+)"`, 'i');
  const match = content.match(regex);
  return match ? match[1] : null;
}

/**
 * Check if a prompt needs updating
 */
export function promptNeedsUpdate(currentVersion: string | null, latestVersion: string): boolean {
  if (!currentVersion) return true;
  
  // Simple version comparison - could be enhanced with semver
  return currentVersion !== latestVersion;
}

/**
 * Parse versions string from firebase_prompts section
 * Format: "firebase_base:1.0.0,firebase_functions:1.0.0"
 */
export function parseVersionsString(versionsStr: string | undefined): PromptVersionMap {
  const versions: PromptVersionMap = {};
  
  if (!versionsStr) return versions;
  
  const pairs = versionsStr.split(',');
  for (const pair of pairs) {
    const [key, value] = pair.split(':');
    if (key && value) {
      versions[key.trim()] = value.trim();
    }
  }
  
  return versions;
}

/**
 * Convert versions map to string format
 */
export function versionsToString(versions: PromptVersionMap): string {
  return Object.entries(versions)
    .map(([key, value]) => `${key}:${value}`)
    .join(',');
}
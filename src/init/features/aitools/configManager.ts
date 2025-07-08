import { diffLines } from "diff";
import { parseVersionsString, versionsToString } from "./promptVersions";

export interface FirebaseSection {
  found: boolean;
  start: number;
  end: number;
  versions?: string;
  content?: string;
}

export const FIREBASE_TAG_REGEX = /<firebase_prompts[^>]*>[\s\S]*?<\/firebase_prompts>/g;
const FIREBASE_TAG_START = /<firebase_prompts([^>]*)>/;
const FIREBASE_TAG_CONTENT_REGEX = /<firebase_prompts[^>]*>([\s\S]*?)<\/firebase_prompts>/;

/**
 * Find existing Firebase section in content
 */
export function findFirebaseSection(content: string): FirebaseSection | null {
  const matches = Array.from(content.matchAll(FIREBASE_TAG_REGEX));

  if (matches.length === 0) {
    return null;
  }

  // Take the first match (we'll handle multiple sections in replace)
  const match = matches[0];
  const fullMatch = match[0];
  const start = match.index!;
  const end = start + fullMatch.length;

  // Extract attributes from the opening tag
  const openingTagMatch = FIREBASE_TAG_START.exec(fullMatch);
  let versions: string | undefined;

  if (openingTagMatch && openingTagMatch[1]) {
    const attributes = openingTagMatch[1];
    
    // Extract versions (simple key:value format)
    const versionsMatch = /versions="([^"]+)"/.exec(attributes);
    if (versionsMatch) {
      versions = versionsMatch[1];
    }
  }

  // Extract content between tags
  const contentMatch = FIREBASE_TAG_CONTENT_REGEX.exec(fullMatch);
  const sectionContent = contentMatch ? contentMatch[1] : "";

  return {
    found: true,
    start,
    end,
    versions,
    content: sectionContent,
  };
}

/**
 * Replace all Firebase sections with new content
 */
export function replaceFirebaseSection(content: string, newSection: string): string {
  // Replace all occurrences of firebase_prompts tags with the new section
  let result = content;
  const matches = Array.from(content.matchAll(FIREBASE_TAG_REGEX));

  if (matches.length === 0) {
    return content;
  }

  // If multiple sections exist, we'll replace them all with a single new one
  // Process matches in reverse order to maintain correct indices
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const start = match.index!;
    const end = start + match[0].length;

    if (i === 0) {
      // Replace the first match with the new section
      result = result.substring(0, start) + newSection + result.substring(end);
    } else {
      // Remove additional matches
      result = result.substring(0, start) + result.substring(end);
    }
  }

  return result;
}

/**
 * Insert Firebase section into content
 */
export function insertFirebaseSection(
  content: string,
  section: string,
  position: "start" | "end" = "end",
): string {
  if (!content) {
    return section;
  }

  if (position === "start") {
    return section + "\n\n" + content;
  } else {
    // Add newlines for proper separation if content doesn't end with newline
    const separator = content.endsWith("\n") ? "\n" : "\n\n";
    return content + separator + section;
  }
}

/**
 * Generate Firebase prompt wrapped in XML tags
 */
export function generateFirebasePrompt(
  promptVersions?: Record<string, string>
): string {
  // Convert versions object to simple key:value format
  let versionsAttr = "";
  if (promptVersions && Object.keys(promptVersions).length > 0) {
    const versionPairs = Object.entries(promptVersions)
      .map(([key, value]) => `${key}:${value}`)
      .join(",");
    versionsAttr = ` versions="${versionPairs}"`;
  }
  
  return `<firebase_prompts${versionsAttr}>
<!-- Firebase Tools Context - Auto-generated, do not edit -->
{{CONTENT}}
</firebase_prompts>`;
}

/**
 * Wrap content in Firebase XML tags
 */
export function wrapInFirebaseTags(
  content: string, 
  promptVersions?: Record<string, string>
): string {
  const template = generateFirebasePrompt(promptVersions);
  return template.replace("{{CONTENT}}", content);
}

/**
 * Generate a diff between original and modified content
 */
export function generateDiff(original: string, modified: string): string {
  const diff = diffLines(original, modified);
  let output = "";

  diff.forEach((part) => {
    const prefix = part.added ? "+" : part.removed ? "-" : " ";
    const lines = part.value.split("\n");
    // Remove only the last empty line if it exists (from the split)
    if (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }
    lines.forEach((line) => {
      output += `${prefix}${line}\n`;
    });
  });

  return output;
}

/**
 * Generate a minimal diff showing only the firebase_prompts tag changes
 */
export function generateMinimalDiff(
  existingSection: FirebaseSection, 
  newVersions: Record<string, string>
): string {
  const oldVersions = parseVersionsString(existingSection.versions);
  
  // Build the old and new opening tags
  const oldTag = `<firebase_prompts${existingSection.versions ? ` versions="${existingSection.versions}"` : ''}>`;
  const newTag = `<firebase_prompts${Object.keys(newVersions).length > 0 ? ` versions="${versionsToString(newVersions)}"` : ''}>`;
  
  if (oldTag === newTag) {
    return ""; // No changes
  }
  
  return `-${oldTag}\n+${newTag}\n`;
}

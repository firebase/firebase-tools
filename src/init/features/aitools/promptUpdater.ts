/**
 * Simple prompt updater for Firebase AI tools
 * Handles updating Firebase context in AI tool configuration files
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { Config } from "../../../config";
import { confirm } from "../../../prompt";
import * as utils from "../../../utils";
import { logger } from "../../../logger";
import { isVSCodeExtension } from "../../../vsCodeUtils";

const CLI_PROMPTS_DIR = path.join(__dirname, "../../../../prompts");
const VSCODE_PROMPTS_DIR = path.join(__dirname, "./prompts"); // vscode sits in firebase-vscode/dist/ folder

const FIREBASE_TAG_REGEX = /<firebase_prompts(?:\s+hash="([^"]+)")?>([\s\S]*?)<\/firebase_prompts>/;

const PROMPT_FILES: Record<string, string> = {
  base: "FIREBASE.md",
  functions: "FIREBASE_FUNCTIONS.md",
  // Future: More Firebase product support
  // firestore: "FIREBASE_FIRESTORE.md",
  // hosting: "FIREBASE_HOSTING.md",
};

function calculateHash(content: string): string {
  return crypto.createHash("sha256").update(content.trim()).digest("hex").substring(0, 8);
}

/**
 * Generate Firebase prompt section with proper hash
 * @param enabledFeatures - Firebase features to include (functions, firestore, etc.)
 * @param options.customContent - Custom content to wrap instead of actual prompts (e.g., file references)
 * @returns Firebase section with hash and either actual prompts or custom content
 */
export function generatePromptSection(
  enabledFeatures: string[],
  options?: { customContent?: string },
): { content: string; hash: string } {
  // Always calculate hash from actual prompts
  let fullContent = getFeatureContent("base");
  for (const feature of enabledFeatures) {
    if (feature !== "base" && PROMPT_FILES[feature]) {
      fullContent += "\n\n" + getFeatureContent(feature);
    }
  }

  const hash = calculateHash(fullContent);

  // Use custom content if provided, otherwise use the actual prompts
  const innerContent = options?.customContent ?? fullContent;

  const wrapped = `<firebase_prompts hash="${hash}">
<!-- Firebase Tools Context - Auto-generated, do not edit -->
${innerContent}
</firebase_prompts>`;

  return { content: wrapped, hash };
}

/**
 * Update a file with Firebase prompts section, preserving user content
 * Used for files like CLAUDE.md and .idx/airules.md
 */
export async function updateFirebaseSection(
  config: Config,
  filePath: string,
  enabledFeatures: string[],
  options?: { header?: string; interactive?: boolean },
): Promise<{ updated: boolean }> {
  const { content: newSection, hash: newHash } = generatePromptSection(enabledFeatures);

  let currentContent = "";
  try {
    currentContent = config.readProjectFile(filePath) || "";
  } catch {
    // File doesn't exist yet
  }

  // Check if section exists and has same hash
  const match = currentContent.match(FIREBASE_TAG_REGEX);
  if (match && match[1] === newHash) {
    return { updated: false };
  }

  // Interactive confirmation
  if (options?.interactive && currentContent) {
    const fileName = filePath.split("/").pop()!;
    logger.info();
    utils.logBullet(`Update available for ${fileName}`);

    const shouldUpdate = await confirm({
      message: `Update Firebase section in ${fileName}?`,
      default: true,
    });

    if (!shouldUpdate) {
      return { updated: false };
    }
  }

  // Generate final content
  let finalContent: string;
  if (!currentContent) {
    // New file
    finalContent = options?.header ? `${options.header}\n\n${newSection}` : newSection;
  } else if (match) {
    // Replace existing section
    finalContent =
      currentContent.substring(0, match.index!) +
      newSection +
      currentContent.substring(match.index! + match[0].length);
  } else {
    // Append to existing file
    const separator = currentContent.endsWith("\n") ? "\n" : "\n\n";
    finalContent = currentContent + separator + newSection;
  }

  config.writeProjectFile(filePath, finalContent);
  return { updated: true };
}

/**
 * Replace an entire prompt file (no user content to preserve)
 * Used for files we fully own like Cursor and Gemini configs
 */
export async function replaceFirebaseFile(
  config: Config,
  filePath: string,
  content: string,
): Promise<{ updated: boolean }> {
  try {
    const existing = config.readProjectFile(filePath);
    if (existing === content) {
      return { updated: false };
    }
  } catch {
    // File doesn't exist, will create
  }

  config.writeProjectFile(filePath, content);
  return { updated: true };
}

/**
 * Get raw prompt content for a specific feature (without wrapper)
 * Used internally for hash calculation
 */
export function getFeatureContent(feature: string): string {
  const filename = PROMPT_FILES[feature];
  if (!filename) return "";

  const PROMPTS_DIR = isVSCodeExtension() ? VSCODE_PROMPTS_DIR : CLI_PROMPTS_DIR;
  const content = fs.readFileSync(path.join(PROMPTS_DIR, filename), "utf8");
  return content;
}

/**
 * Generate wrapped content for a specific feature
 * Used by Cursor/Gemini for separate feature files
 */
export function generateFeaturePromptSection(feature: string): string {
  const content = getFeatureContent(feature);
  if (!content) return "";

  const hash = calculateHash(content);
  return `<firebase_${feature}_prompts hash="${hash}">
<!-- Firebase ${feature.charAt(0).toUpperCase() + feature.slice(1)} Context - Auto-generated, do not edit -->
${content}
</firebase_${feature}_prompts>`;
}

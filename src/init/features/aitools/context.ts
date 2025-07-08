import * as fs from "fs";
import * as path from "path";
import { extractPromptVersion } from "./promptVersions";

/**
 * Generic function to get product version
 */
export function getProductVersion(product: string, fileName: string): string | null {
  const promptsDir = path.join(__dirname, "../../../../prompts");
  const filePath = path.join(promptsDir, fileName);
  
  try {
    const rawContent = fs.readFileSync(filePath, "utf8");
    return extractPromptVersion(rawContent, product);
  } catch (e) {
    // File doesn't exist
    return null;
  }
}

/**
 * Generic function to get product context (without version tags)
 */
export function getProductContext(product: string, fileName: string): string {
  const promptsDir = path.join(__dirname, "../../../../prompts");
  const filePath = path.join(promptsDir, fileName);
  
  try {
    const rawContent = fs.readFileSync(filePath, "utf8");
    // Strip the version XML tags for the content
    const tagRegex = new RegExp(`<\\/?${product}_context[^>]*>`, 'g');
    return rawContent.replace(tagRegex, '').trim();
  } catch (e) {
    // File doesn't exist
    return '';
  }
}

/**
 * Get the base Firebase context from the prompts directory
 */
export function getBaseContext(): string {
  return getProductContext("firebase_base", "FIREBASE.md");
}

/**
 * Get the base Firebase context version
 */
export function getBaseVersion(): string | null {
  return getProductVersion("firebase_base", "FIREBASE.md");
}

/**
 * Get the Firebase Functions context
 */
export function getFunctionsContext(): string {
  return getProductContext("firebase_functions", "FIREBASE_FUNCTIONS.md");
}

/**
 * Get the Firebase Functions context version
 */
export function getFunctionsVersion(): string | null {
  return getProductVersion("firebase_functions", "FIREBASE_FUNCTIONS.md");
}

/**
 * Get a combined Firebase context including all enabled features
 * @param enabledFeatures List of enabled Firebase features
 */
export function getCombinedContext(enabledFeatures: string[]): string {
  let context = getBaseContext();

  if (enabledFeatures.includes("functions")) {
    context += "\n\n# Firebase Functions Context\n\n" + getFunctionsContext();
  }

  // Future: Add other feature contexts as they become available
  // if (enabledFeatures.includes("firestore")) {
  //   context += "\n\n# Firestore Context\n\n" + getFirestoreContext();
  // }

  return context;
}

// Mapping of features to their prompt file info
const FEATURE_PROMPT_MAP: Record<string, { product: string; fileName: string }> = {
  functions: { product: "firebase_functions", fileName: "FIREBASE_FUNCTIONS.md" },
  // Future features:
  // firestore: { product: "firebase_firestore", fileName: "FIREBASE_FIRESTORE.md" },
  // hosting: { product: "firebase_hosting", fileName: "FIREBASE_HOSTING.md" },
  // storage: { product: "firebase_storage", fileName: "FIREBASE_STORAGE.md" },
};

/**
 * Get all prompt versions for enabled features
 */
export function getPromptVersions(enabledFeatures: string[]): Record<string, string> {
  const versions: Record<string, string> = {};
  
  // Always include base version
  const baseVersion = getBaseVersion();
  if (baseVersion) {
    versions.firebase_base = baseVersion;
  }
  
  // Add feature-specific versions
  for (const feature of enabledFeatures) {
    const promptInfo = FEATURE_PROMPT_MAP[feature];
    if (promptInfo) {
      const version = getProductVersion(promptInfo.product, promptInfo.fileName);
      if (version) {
        versions[promptInfo.product] = version;
      }
    }
  }
  
  return versions;
}

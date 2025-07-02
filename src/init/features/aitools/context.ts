import * as fs from "fs";
import * as path from "path";

/**
 * Get the base Firebase context from the prompts directory
 */
export function getBaseContext(): string {
  const promptsDir = path.join(__dirname, "../../../../prompts");
  return fs.readFileSync(path.join(promptsDir, "FIREBASE.md"), "utf8");
}

/**
 * Get the Firebase Functions context if functions are enabled
 */
export function getFunctionsContext(): string {
  const promptsDir = path.join(__dirname, "../../../../prompts");
  return fs.readFileSync(path.join(promptsDir, "FIREBASE_FUNCTIONS.md"), "utf8");
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
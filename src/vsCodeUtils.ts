/**
 * Detect if code is running in a VSCode Extension
 */
export function isVSCodeExtension(): boolean {
  return !!process.env.IS_FIREBASE_VSCE;
}

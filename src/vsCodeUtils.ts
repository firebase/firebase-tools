let _IS_WEBPACKED_FOR_VSCE = false;
/**
 * Detect if code is running in a VSCode Extension
 */
export function isVSCodeExtension(): boolean {
  return _IS_WEBPACKED_FOR_VSCE;
}

export function setIsVSCodeExtension(v: boolean) {
  _IS_WEBPACKED_FOR_VSCE = v;
}

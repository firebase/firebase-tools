// @eslint-disable @typescript-eslint/no-namespace
declare namespace globalThis {
  let WEBPACK_IS_VSCE: string | undefined;
}
/**
 * Detect if code is running in a VSCode Extension
 */
export function isVSCodeExtension(): boolean {
  return !!globalThis.WEBPACK_IS_VSCE;
}

import { configstore } from "../configstore";

export const NEVER_ASK_AGAIN_KEY = "gemini.neverAskAgain";

export function setNeverAskAgain(value: boolean): void {
  configstore.set(NEVER_ASK_AGAIN_KEY, value);
}

export function getNeverAskAgain(): boolean {
  return configstore.get(NEVER_ASK_AGAIN_KEY) || false;
}

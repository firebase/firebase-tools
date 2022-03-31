import { EmulatorRegistry } from "../registry";
import { Emulators } from "../types";

/**
 * replaceConsoleLinks replaces links to production Firebase console with links to the corresponding Emulator UI page.
 * @param postinstall The postinstall instructions to check for console links.
 */
export function replaceConsoleLinks(postinstall: string): string {
  const uiInfo = EmulatorRegistry.getInfo(Emulators.UI);
  const uiUrl = uiInfo ? `http://${EmulatorRegistry.getInfoHostString(uiInfo)}` : "unknown";
  let subbedPostinstall = postinstall;
  const linkReplacements = new Map<RegExp, string>([
    [
      /(http[s]?:\/\/)?console\.firebase\.google\.com\/(u\/[0-9]\/)?project\/[A-Za-z0-9-]+\/storage[A-Za-z0-9\/-]*(?=[\)\]\s])/,
      `${uiUrl}/${Emulators.STORAGE}`,
    ], // Storage console links
    [
      /(http[s]?:\/\/)?console\.firebase\.google\.com\/(u\/[0-9]\/)?project\/[A-Za-z0-9-]+\/firestore[A-Za-z0-9\/-]*(?=[\)\]\s])/,
      `${uiUrl}/${Emulators.FIRESTORE}`,
    ], // Firestore console links
    [
      /(http[s]?:\/\/)?console\.firebase\.google\.com\/(u\/[0-9]\/)?project\/[A-Za-z0-9-]+\/database[A-Za-z0-9\/-]*(?=[\)\]\s])/,
      `${uiUrl}/${Emulators.DATABASE}`,
    ], // RTDB console links
    [
      /(http[s]?:\/\/)?console\.firebase\.google\.com\/(u\/[0-9]\/)?project\/[A-Za-z0-9-]+\/authentication[A-Za-z0-9\/-]*(?=[\)\]\s])/,
      `${uiUrl}/${Emulators.AUTH}`,
    ], // Auth console links
    [
      /(http[s]?:\/\/)?console\.firebase\.google\.com\/(u\/[0-9]\/)?project\/[A-Za-z0-9-]+\/functions[A-Za-z0-9\/-]*(?=[\)\]\s])/,
      `${uiUrl}/logs`, // There is no functions page in the UI, so redirect to logs.
    ], // Functions console links
    [
      /(http[s]?:\/\/)?console\.firebase\.google\.com\/(u\/[0-9]\/)?project\/[A-Za-z0-9-]+\/extensions[A-Za-z0-9\/-]*(?=[\)\]\s])/,
      `${uiUrl}/${Emulators.EXTENSIONS}`,
    ], // Extensions console links
  ]);
  for (const [consoleLinkRegex, replacement] of linkReplacements) {
    subbedPostinstall = subbedPostinstall.replace(consoleLinkRegex, replacement);
  }
  return subbedPostinstall;
}

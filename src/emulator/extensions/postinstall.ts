import { EmulatorRegistry } from "../registry";
import { Emulators } from "../types";

export function replaceConsoleLinks(postinstall: string): string {
  const uiInfo = EmulatorRegistry.getInfo(Emulators.UI);
  const uiUrl = uiInfo ? `http://${EmulatorRegistry.getInfoHostString(uiInfo)}` : "unknown";
  let subbedPostinstall = postinstall;
  const linkReplacements = new Map<RegExp, string>([
    [
      /(http[s]?:\/\/)?console\.firebase\.google\.com\/project\/[A-Za-z0-9-]+\/storage[A-Za-z0-9\/-]*(?=[\)\]\s])/,
      `${uiUrl}/storage`,
    ], // Storage console links
    [
      /(http[s]?:\/\/)?console\.firebase\.google\.com\/project\/[A-Za-z0-9-]+\/firestore[A-Za-z0-9\/-]*(?=[\)\]\s])/,
      `${uiUrl}/firestore`,
    ], // Firestore console links
    [
      /(http[s]?:\/\/)?console\.firebase\.google\.com\/project\/[A-Za-z0-9-]+\/database[A-Za-z0-9\/-]*(?=[\)\]\s])/,
      `${uiUrl}/database`,
    ], // RTDB console links
    [
      /(http[s]?:\/\/)?console\.firebase\.google\.com\/project\/[A-Za-z0-9-]+\/authentication[A-Za-z0-9\/-]*(?=[\)\]\s])/,
      `${uiUrl}/auth`,
    ], // Auth console links
    [
      /(http[s]?:\/\/)?console\.firebase\.google\.com\/project\/[A-Za-z0-9-]+\/functions[A-Za-z0-9\/-]*(?=[\)\]\s])/,
      `${uiUrl}/logs`,
    ], // Functions console links
    [
      /(http[s]?:\/\/)?console\.firebase\.google\.com\/project\/[A-Za-z0-9-]+\/extensions[A-Za-z0-9\/-]*(?=[\)\]\s])/,
      `${uiUrl}/extensions`,
    ], // Extensions console links
  ]);
  for (const [consoleLinkRegex, replacement] of linkReplacements) {
    subbedPostinstall = subbedPostinstall.replace(consoleLinkRegex, replacement);
  }
  return subbedPostinstall;
}

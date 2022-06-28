/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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

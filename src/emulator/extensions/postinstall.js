"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.replaceConsoleLinks = void 0;
const registry_1 = require("../registry");
const types_1 = require("../types");
/**
 * replaceConsoleLinks replaces links to production Firebase console with links to the corresponding Emulator UI page.
 * @param postinstall The postinstall instructions to check for console links.
 */
function replaceConsoleLinks(postinstall) {
    const uiRunning = registry_1.EmulatorRegistry.isRunning(types_1.Emulators.UI);
    const uiUrl = uiRunning ? registry_1.EmulatorRegistry.url(types_1.Emulators.UI).toString() : "unknown";
    let subbedPostinstall = postinstall;
    const linkReplacements = new Map([
        [
            /(http[s]?:\/\/)?console\.firebase\.google\.com\/(u\/[0-9]\/)?project\/[A-Za-z0-9-]+\/storage[A-Za-z0-9\/-]*(?=[\)\]\s])/,
            `${uiUrl}${types_1.Emulators.STORAGE}`,
        ],
        [
            /(http[s]?:\/\/)?console\.firebase\.google\.com\/(u\/[0-9]\/)?project\/[A-Za-z0-9-]+\/firestore[A-Za-z0-9\/-]*(?=[\)\]\s])/,
            `${uiUrl}${types_1.Emulators.FIRESTORE}`,
        ],
        [
            /(http[s]?:\/\/)?console\.firebase\.google\.com\/(u\/[0-9]\/)?project\/[A-Za-z0-9-]+\/database[A-Za-z0-9\/-]*(?=[\)\]\s])/,
            `${uiUrl}${types_1.Emulators.DATABASE}`,
        ],
        [
            /(http[s]?:\/\/)?console\.firebase\.google\.com\/(u\/[0-9]\/)?project\/[A-Za-z0-9-]+\/authentication[A-Za-z0-9\/-]*(?=[\)\]\s])/,
            `${uiUrl}${types_1.Emulators.AUTH}`,
        ],
        [
            /(http[s]?:\/\/)?console\.firebase\.google\.com\/(u\/[0-9]\/)?project\/[A-Za-z0-9-]+\/functions[A-Za-z0-9\/-]*(?=[\)\]\s])/,
            `${uiUrl}logs`, // There is no functions page in the UI, so redirect to logs.
        ],
        [
            /(http[s]?:\/\/)?console\.firebase\.google\.com\/(u\/[0-9]\/)?project\/[A-Za-z0-9-]+\/extensions[A-Za-z0-9\/-]*(?=[\)\]\s])/,
            `${uiUrl}${types_1.Emulators.EXTENSIONS}`,
        ], // Extensions console links
    ]);
    for (const [consoleLinkRegex, replacement] of linkReplacements) {
        subbedPostinstall = subbedPostinstall.replace(consoleLinkRegex, replacement);
    }
    return subbedPostinstall;
}
exports.replaceConsoleLinks = replaceConsoleLinks;
//# sourceMappingURL=postinstall.js.map
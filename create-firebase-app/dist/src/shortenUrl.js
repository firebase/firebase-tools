"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shortenUrl = void 0;
const logger_1 = require("./logger");
const apiv2_1 = require("./apiv2");
const api_1 = require("./api");
const DYNAMIC_LINKS_PREFIX = "https://firebase.tools/l";
const apiClient = new apiv2_1.Client({
    urlPrefix: (0, api_1.dynamicLinksOrigin)(),
    auth: false,
    apiVersion: "v1",
});
/**
 * Attempts to shorten a URL for easier display in terminals. Falls back to returning the original URL if anything goes wrong.
 *
 * @param url The URL to shorten.
 * @param guessable When true, a shorter suffix (~4 characters) is used instead of an unguessable one. Do not set to true when URL contains personally identifiable information.
 * @return The short URL or the original URL if an error occurs.
 */
async function shortenUrl(url, guessable = false) {
    try {
        const response = await apiClient.post(`shortLinks?key=${(0, api_1.dynamicLinksKey)()}`, {
            dynamicLinkInfo: {
                link: url,
                domainUriPrefix: DYNAMIC_LINKS_PREFIX,
            },
            suffix: { option: guessable ? "SHORT" : "UNGUESSABLE" },
        });
        return response.body.shortLink;
    }
    catch (e) {
        logger_1.logger.debug("URL shortening failed, falling back to full URL. Error:", e.original || e);
        return url;
    }
}
exports.shortenUrl = shortenUrl;

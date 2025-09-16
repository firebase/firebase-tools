"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.interactiveCreateHostingSite = void 0;
const error_1 = require("../error");
const utils_1 = require("../utils");
const projectUtils_1 = require("../projectUtils");
const api_1 = require("./api");
const prompt_1 = require("../prompt");
const nameSuggestion = new RegExp("try something like `(.+)`");
// const prompt = "Please provide an unique, URL-friendly id for the site (<id>.web.app):";
const prompt = "Please provide an unique, URL-friendly id for your site. Your site's URL will be <site-id>.web.app. " +
    'We recommend using letters, numbers, and hyphens (e.g. "{project-id}-{random-hash}"):';
/**
 * Interactively prompt to create a Hosting site.
 */
async function interactiveCreateHostingSite(siteId, appId, options) {
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const projectNumber = await (0, projectUtils_1.needProjectNumber)(options);
    let id = siteId;
    let newSite;
    let suggestion;
    // If we were given an ID, we're going to start with that, so don't check the project ID.
    // If we weren't given an ID, let's _suggest_ the project ID as the site name (or a variant).
    if (!id) {
        const attempt = await trySiteID(projectNumber, projectId);
        if (attempt.available) {
            suggestion = projectId;
        }
        else {
            suggestion = attempt.suggestion;
        }
    }
    while (!newSite) {
        if (!id || suggestion) {
            id = await (0, prompt_1.input)({
                message: prompt,
                validate: (s) => s.length > 0,
                default: suggestion,
            });
        }
        try {
            newSite = await (0, api_1.createSite)(projectNumber, id, appId);
        }
        catch (err) {
            if (!(err instanceof error_1.FirebaseError)) {
                throw err;
            }
            if (options.nonInteractive) {
                throw err;
            }
            id = ""; // Clear so the prompt comes back.
            suggestion = getSuggestionFromError(err);
        }
    }
    return newSite;
}
exports.interactiveCreateHostingSite = interactiveCreateHostingSite;
async function trySiteID(projectNumber, id) {
    try {
        await (0, api_1.createSite)(projectNumber, id, "", true);
        return { available: true };
    }
    catch (err) {
        if (!(err instanceof error_1.FirebaseError)) {
            throw err;
        }
        const suggestion = getSuggestionFromError(err);
        return { available: false, suggestion };
    }
}
function getSuggestionFromError(err) {
    if (err.status === 400 && err.message.includes("Invalid name:")) {
        const i = err.message.indexOf("Invalid name:");
        (0, utils_1.logWarning)(err.message.substring(i));
        const match = nameSuggestion.exec(err.message);
        if (match) {
            return match[1];
        }
    }
    else {
        (0, utils_1.logWarning)(err.message);
    }
    return;
}

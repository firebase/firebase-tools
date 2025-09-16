"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireHostingSite = void 0;
const getDefaultHostingSite_1 = require("./getDefaultHostingSite");
/**
 * Ensure that a hosting site is set, fetching it from defaultHostingSite if not already present.
 * @param options command line options passed in.
 */
async function requireHostingSite(options) {
    if (options.site) {
        return Promise.resolve();
    }
    const site = await (0, getDefaultHostingSite_1.getDefaultHostingSite)(options);
    options.site = site;
}
exports.requireHostingSite = requireHostingSite;
//# sourceMappingURL=requireHostingSite.js.map
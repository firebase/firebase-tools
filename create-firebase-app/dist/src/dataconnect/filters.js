"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toString = exports.getResourceFilters = void 0;
const error_1 = require("../error");
function getResourceFilters(options) {
    if (!options.only) {
        return undefined;
    }
    const selectors = options.only.split(",");
    const filters = [];
    for (let selector of selectors) {
        if (selector.startsWith("dataconnect:")) {
            selector = selector.replace("dataconnect:", "");
            if (selector.length > 0) {
                filters.push(parseSelector(selector));
            }
        }
    }
    if (filters.length === 0) {
        return undefined;
    }
    return filters;
}
exports.getResourceFilters = getResourceFilters;
function parseSelector(selector) {
    const parts = selector.split(":");
    const filter = {
        serviceId: parts[0],
    };
    if (parts.length === 2) {
        if (parts[1] === "schema") {
            filter.schemaOnly = true;
        }
        else {
            filter.connectorId = parts[1];
        }
    }
    else if (parts.length === 1) {
        filter.fullService = true;
    }
    else {
        throw new error_1.FirebaseError(`Invalid '--only' filter dataconnect:${selector}`);
    }
    return filter;
}
function toString(rf) {
    const base = `dataconnect:${rf.serviceId}`;
    if (rf.connectorId) {
        return `${base}:${rf.connectorId}`;
    }
    if (rf.schemaOnly) {
        return `${base}:schema`;
    }
    return base;
}
exports.toString = toString;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventUtils = void 0;
/**
 * Utilities for operating on event types.
 */
class EventUtils {
    static isEvent(proto) {
        return proto.context && proto.data;
    }
    static isLegacyEvent(proto) {
        return proto.data && proto.resource;
    }
    static isBinaryCloudEvent(req) {
        return !!(req.header("ce-type") &&
            req.header("ce-specversion") &&
            req.header("ce-source") &&
            req.header("ce-id"));
    }
    static extractBinaryCloudEventContext(req) {
        const context = {};
        for (const name of Object.keys(req.headers)) {
            if (name.startsWith("ce-")) {
                const attributeName = name.substr("ce-".length);
                context[attributeName] = req.header(name);
            }
        }
        return context;
    }
}
exports.EventUtils = EventUtils;

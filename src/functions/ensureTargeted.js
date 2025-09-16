"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureTargeted = void 0;
/**
 * Implementation of ensureTargeted.
 */
function ensureTargeted(only, codebaseOrFunction, functionId) {
    const parts = only.split(",");
    if (parts.includes("functions")) {
        return only;
    }
    let newTarget = `functions:${codebaseOrFunction}`;
    if (parts.includes(newTarget)) {
        return only;
    }
    if (functionId) {
        newTarget = `${newTarget}:${functionId}`;
        if (parts.includes(newTarget)) {
            return only;
        }
    }
    return `${only},${newTarget}`;
}
exports.ensureTargeted = ensureTargeted;
//# sourceMappingURL=ensureTargeted.js.map
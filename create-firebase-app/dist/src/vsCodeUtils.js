"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setIsVSCodeExtension = exports.isVSCodeExtension = void 0;
let _IS_WEBPACKED_FOR_VSCE = false;
/**
 * Detect if code is running in a VSCode Extension
 */
function isVSCodeExtension() {
    return _IS_WEBPACKED_FOR_VSCE;
}
exports.isVSCodeExtension = isVSCodeExtension;
function setIsVSCodeExtension(v) {
    _IS_WEBPACKED_FOR_VSCE = v;
}
exports.setIsVSCodeExtension = setIsVSCodeExtension;

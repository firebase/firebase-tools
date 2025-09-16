"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isFirebaseMcp = exports.isFirebaseStudio = void 0;
const fsutils_1 = require("./fsutils");
let googleIdxFolderExists;
function isFirebaseStudio() {
    if (googleIdxFolderExists === true || process.env.MONOSPACE_ENV)
        return true;
    if (googleIdxFolderExists === false)
        return false;
    googleIdxFolderExists = (0, fsutils_1.dirExistsSync)("/google/idx");
    return googleIdxFolderExists;
}
exports.isFirebaseStudio = isFirebaseStudio;
function isFirebaseMcp() {
    return !!process.env.IS_FIREBASE_MCP;
}
exports.isFirebaseMcp = isFirebaseMcp;

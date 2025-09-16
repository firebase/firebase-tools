"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readTemplate = exports.readTemplateSync = exports.absoluteTemplateFilePath = void 0;
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const vsCodeUtils_1 = require("./vsCodeUtils");
const TEMPLATE_ENCODING = "utf8";
/**
 * Get an absolute template file path. (Prefer readTemplateSync instead.)
 * @param relPath file path relative to the /templates directory under root.
 */
function absoluteTemplateFilePath(relPath) {
    if ((0, vsCodeUtils_1.isVSCodeExtension)()) {
        // In the VSCE, the /templates directory is copied into dist, which makes it
        // right next to the compiled files (from various sources including this
        // TS file). See CopyPlugin in `../firebase-vscode/webpack.common.js`.
        return (0, path_1.resolve)(__dirname, "templates", relPath);
    }
    // Otherwise, the /templates directory is one level above /src or /lib.
    return (0, path_1.resolve)(__dirname, "../templates", relPath);
}
exports.absoluteTemplateFilePath = absoluteTemplateFilePath;
/**
 * Read a template file synchronously.
 * @param relPath file path relative to the /templates directory under root.
 */
function readTemplateSync(relPath) {
    return (0, fs_1.readFileSync)(absoluteTemplateFilePath(relPath), TEMPLATE_ENCODING);
}
exports.readTemplateSync = readTemplateSync;
/**
 * Read a template file asynchronously.
 * @param relPath file path relative to the /templates directory under root.
 */
function readTemplate(relPath) {
    return (0, promises_1.readFile)(absoluteTemplateFilePath(relPath), TEMPLATE_ENCODING);
}
exports.readTemplate = readTemplate;
//# sourceMappingURL=templates.js.map
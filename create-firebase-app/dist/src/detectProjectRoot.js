"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectProjectRoot = void 0;
const fsutils_1 = require("./fsutils");
const error_1 = require("./error");
const path_1 = require("path");
function detectProjectRoot(options) {
    let projectRootDir = options.cwd || process.cwd();
    if (options.configPath) {
        const fullPath = (0, path_1.resolve)(projectRootDir, options.configPath);
        if (!(0, fsutils_1.fileExistsSync)(fullPath)) {
            throw new error_1.FirebaseError(`Could not load config file ${options.configPath}.`, {
                exit: 1,
                status: 404,
            });
        }
        return (0, path_1.dirname)(fullPath);
    }
    while (!(0, fsutils_1.fileExistsSync)((0, path_1.resolve)(projectRootDir, "./firebase.json"))) {
        const parentDir = (0, path_1.dirname)(projectRootDir);
        if (parentDir === projectRootDir) {
            return null;
        }
        projectRootDir = parentDir;
    }
    return projectRootDir;
}
exports.detectProjectRoot = detectProjectRoot;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProjectPath = void 0;
const path = require("path");
const detectProjectRoot_1 = require("./detectProjectRoot");
const error_1 = require("./error");
/**
 * Returns a fully qualified path to the wanted file/directory inside the project.
 * @param options options object.
 * @param filePath the target file or directory in the project.
 * @return the fully resolved path within the project directory
 */
function resolveProjectPath(options, filePath) {
    const projectRoot = (0, detectProjectRoot_1.detectProjectRoot)(options);
    if (!projectRoot) {
        throw new error_1.FirebaseError("Expected to be in a project directory, but none was found.", {
            exit: 2,
        });
    }
    return path.resolve(projectRoot, filePath);
}
exports.resolveProjectPath = resolveProjectPath;

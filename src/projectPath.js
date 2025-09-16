"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProjectPath = void 0;
const path = __importStar(require("path"));
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
//# sourceMappingURL=projectPath.js.map
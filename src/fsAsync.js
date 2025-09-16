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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readdirRecursive = void 0;
const fs_extra_1 = require("fs-extra");
const ignore_1 = __importDefault(require("ignore"));
const _ = __importStar(require("lodash"));
const minimatch = __importStar(require("minimatch"));
const path_1 = require("path");
async function readdirRecursiveHelper(options) {
    const dirContents = (0, fs_extra_1.readdirSync)(options.path);
    const fullPaths = dirContents.map((n) => (0, path_1.join)(options.path, n));
    const filteredPaths = fullPaths.filter((p) => !options.filter(p));
    const filePromises = [];
    for (const p of filteredPaths) {
        const fstat = (0, fs_extra_1.statSync)(p);
        if (fstat.isFile()) {
            filePromises.push(Promise.resolve({ name: p, mode: fstat.mode }));
        }
        if (!fstat.isDirectory()) {
            continue;
        }
        filePromises.push(readdirRecursiveHelper({ path: p, filter: options.filter }));
    }
    const files = await Promise.all(filePromises);
    let flatFiles = _.flattenDeep(files);
    flatFiles = flatFiles.filter((f) => f !== null);
    return flatFiles;
}
/**
 * Recursively read a directory.
 * @param options options object.
 * @return array of files that match.
 */
async function readdirRecursive(options) {
    const mmopts = { matchBase: true, dot: true };
    const rules = (options.ignore || []).map((glob) => {
        return (p) => minimatch(p, glob, mmopts);
    });
    const gitIgnoreRules = (0, ignore_1.default)()
        .add(options.ignore || [])
        .createFilter();
    const filter = (t) => {
        if (options.isGitIgnore) {
            // the git ignore filter will return true if given path should be included,
            // so we need to negative that return false to avoid filtering it.
            return !gitIgnoreRules((0, path_1.relative)(options.path, t));
        }
        return rules.some((rule) => {
            return rule(t);
        });
    };
    return await readdirRecursiveHelper({
        path: options.path,
        filter: filter,
    });
}
exports.readdirRecursive = readdirRecursive;
//# sourceMappingURL=fsAsync.js.map
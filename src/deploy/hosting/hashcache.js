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
exports.dump = exports.load = void 0;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const logger_1 = require("../../logger");
function cachePath(cwd, name) {
    return path.resolve(cwd, `.firebase/hosting.${name}.cache`);
}
/**
 * Load brings in the data from the cache named by `name`.
 */
function load(cwd, name) {
    try {
        const out = new Map();
        const lines = fs.readFileSync(cachePath(cwd, name), "utf8");
        for (const line of lines.split("\n")) {
            const d = line.split(",");
            if (d.length === 3) {
                out.set(d[0], { mtime: parseInt(d[1]), hash: d[2] });
            }
        }
        return out;
    }
    catch (e) {
        if (e.code === "ENOENT") {
            logger_1.logger.debug(`[hosting] hash cache [${name}] not populated`);
        }
        else {
            logger_1.logger.debug(`[hosting] hash cache [${name}] load error: ${e.message}`);
        }
        return new Map();
    }
}
exports.load = load;
/**
 * Dump puts the data specified into the cache named by `name`.
 */
function dump(cwd, name, data) {
    let st = "";
    let count = 0;
    for (const [path, d] of data) {
        count++;
        st += `${path},${d.mtime},${d.hash}\n`;
    }
    try {
        fs.outputFileSync(cachePath(cwd, name), st, { encoding: "utf8" });
        logger_1.logger.debug(`[hosting] hash cache [${name}] stored for ${count} files`);
    }
    catch (e) {
        logger_1.logger.debug(`[hosting] unable to store hash cache [${name}]: ${e.stack}`);
    }
}
exports.dump = dump;
//# sourceMappingURL=hashcache.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadCJSON = void 0;
const error_1 = require("./error");
const cjson = require("cjson");
/**
 * Loads CJSON from given path.
 */
function loadCJSON(path) {
    try {
        return cjson.load(path);
    }
    catch (e) {
        if (e.code === "ENOENT") {
            throw new error_1.FirebaseError(`File ${path} does not exist`);
        }
        throw new error_1.FirebaseError(`Parse Error in ${path}:\n\n${e.message}`);
    }
}
exports.loadCJSON = loadCJSON;

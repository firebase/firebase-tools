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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.discover = exports.init = exports.type = exports.name = void 0;
const vite_1 = require("../vite");
__exportStar(require("../vite"), exports);
exports.name = "Svelte";
exports.type = 3 /* FrameworkType.Framework */;
exports.init = (0, vite_1.initViteTemplate)("svelte");
exports.discover = (0, vite_1.vitePluginDiscover)("vite-plugin-svelte");

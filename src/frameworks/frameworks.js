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
exports.WebFrameworks = void 0;
const angular = __importStar(require("./angular"));
const astro = __importStar(require("./astro"));
const express = __importStar(require("./express"));
const lit = __importStar(require("./lit"));
const next = __importStar(require("./next"));
const nuxt = __importStar(require("./nuxt"));
const nuxt2 = __importStar(require("./nuxt2"));
const preact = __importStar(require("./preact"));
const svelte = __importStar(require("./svelte"));
const svelekit = __importStar(require("./sveltekit"));
const react = __importStar(require("./react"));
const vite = __importStar(require("./vite"));
const flutter = __importStar(require("./flutter"));
exports.WebFrameworks = {
    angular,
    astro,
    express,
    lit,
    next,
    nuxt,
    nuxt2,
    preact,
    svelte,
    svelekit,
    react,
    vite,
    flutter,
};
//# sourceMappingURL=frameworks.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ɵcodegenFunctionsDirectory = exports.ɵcodegenPublicDirectory = exports.build = exports.supportedRange = exports.getDevModeHandle = exports.discover = exports.type = exports.support = exports.name = void 0;
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const vite_1 = require("../vite");
const fsutils_1 = require("../../fsutils");
const { dynamicImport } = require(true && "../../dynamicImport");
exports.name = "SvelteKit";
exports.support = "experimental" /* SupportLevel.Experimental */;
exports.type = 2 /* FrameworkType.MetaFramework */;
exports.discover = (0, vite_1.viteDiscoverWithNpmDependency)("@sveltejs/kit");
var vite_2 = require("../vite");
Object.defineProperty(exports, "getDevModeHandle", { enumerable: true, get: function () { return vite_2.getDevModeHandle; } });
Object.defineProperty(exports, "supportedRange", { enumerable: true, get: function () { return vite_2.supportedRange; } });
async function build(root, target) {
    var _a;
    const config = await getConfig(root);
    const wantsBackend = ((_a = config.kit.adapter) === null || _a === void 0 ? void 0 : _a.name) !== "@sveltejs/adapter-static";
    await (0, vite_1.build)(root, target);
    return { wantsBackend };
}
exports.build = build;
async function ɵcodegenPublicDirectory(root, dest) {
    const config = await getConfig(root);
    const output = (0, path_1.join)(root, config.kit.outDir, "output");
    await (0, fs_extra_1.copy)((0, path_1.join)(output, "client"), dest);
    const prerenderedPath = (0, path_1.join)(output, "prerendered", "pages");
    if (await (0, fs_extra_1.pathExists)(prerenderedPath)) {
        await (0, fs_extra_1.copy)(prerenderedPath, dest);
    }
}
exports.ɵcodegenPublicDirectory = ɵcodegenPublicDirectory;
async function ɵcodegenFunctionsDirectory(sourceDir, destDir) {
    var _a;
    var _b;
    const packageJsonBuffer = await (0, fs_extra_1.readFile)((0, path_1.join)(sourceDir, "package.json"));
    const packageJson = JSON.parse(packageJsonBuffer.toString());
    packageJson.dependencies || (packageJson.dependencies = {});
    (_a = (_b = packageJson.dependencies)["@sveltejs/kit"]) !== null && _a !== void 0 ? _a : (_b["@sveltejs/kit"] = packageJson.devDependencies["@sveltejs/kit"]);
    const config = await getConfig(sourceDir);
    await (0, fs_extra_1.copy)((0, path_1.join)(sourceDir, config.kit.outDir, "output", "server"), destDir);
    return { packageJson, frameworksEntry: "sveltekit" };
}
exports.ɵcodegenFunctionsDirectory = ɵcodegenFunctionsDirectory;
async function getConfig(root) {
    var _a;
    const configPath = ["svelte.config.js", "svelte.config.mjs"]
        .map((filename) => (0, path_1.join)(root, filename))
        .find(fsutils_1.fileExistsSync);
    const config = configPath ? (await dynamicImport(configPath)).default : {};
    config.kit || (config.kit = {});
    (_a = config.kit).outDir || (_a.outDir = ".svelte-kit");
    return config;
}

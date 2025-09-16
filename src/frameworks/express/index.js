"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ɵcodegenFunctionsDirectory = exports.ɵcodegenPublicDirectory = exports.build = exports.discover = exports.docsUrl = exports.type = exports.support = exports.name = void 0;
const child_process_1 = require("child_process");
const fs_extra_1 = require("fs-extra");
const promises_1 = require("fs/promises");
const path_1 = require("path");
// Use "true &&"" to keep typescript from compiling this file and rewriting
// the import statement into a require
const { dynamicImport } = require(true && "../../dynamicImport");
exports.name = "Express.js";
exports.support = "preview" /* SupportLevel.Preview */;
exports.type = 0 /* FrameworkType.Custom */;
exports.docsUrl = "https://firebase.google.com/docs/hosting/frameworks/express";
async function getConfig(root) {
    const packageJsonBuffer = await (0, promises_1.readFile)((0, path_1.join)(root, "package.json"));
    const packageJson = JSON.parse(packageJsonBuffer.toString());
    const serve = packageJson.directories?.serve;
    const serveDir = serve && (0, path_1.join)(root, packageJson.directories?.serve);
    return { serveDir, packageJson };
}
async function discover(dir) {
    if (!(await (0, fs_extra_1.pathExists)((0, path_1.join)(dir, "package.json"))))
        return;
    const { serveDir: publicDirectory } = await getConfig(dir);
    if (!publicDirectory)
        return;
    return { mayWantBackend: true, publicDirectory };
}
exports.discover = discover;
async function build(cwd) {
    (0, child_process_1.execSync)(`npm run build`, { stdio: "inherit", cwd });
    const wantsBackend = !!(await getBootstrapScript(cwd));
    return { wantsBackend };
}
exports.build = build;
async function ɵcodegenPublicDirectory(root, dest) {
    const { serveDir } = await getConfig(root);
    await (0, fs_extra_1.copy)(serveDir, dest);
}
exports.ɵcodegenPublicDirectory = ɵcodegenPublicDirectory;
async function getBootstrapScript(root, _bootstrapScript = "", _entry) {
    let entry = _entry;
    let bootstrapScript = _bootstrapScript;
    const allowRecursion = !entry;
    if (!entry) {
        const { packageJson: { name }, } = await getConfig(root);
        try {
            entry = require(root);
            bootstrapScript = `const bootstrap = Promise.resolve(require('${name}'))`;
        }
        catch (e) {
            entry = await dynamicImport(root).catch(() => undefined);
            bootstrapScript = `const bootstrap = import('${name}')`;
        }
    }
    if (!entry)
        return undefined;
    const { default: defaultExport, app, handle } = entry;
    if (typeof handle === "function") {
        return (bootstrapScript +
            ";\nexports.handle = async (req, res) => (await bootstrap).handle(req, res);");
    }
    if (typeof app === "function") {
        try {
            const express = app();
            if (typeof express.render === "function") {
                return (bootstrapScript +
                    ";\nexports.handle = async (req, res) => (await bootstrap).app(req, res);");
            }
        }
        catch (e) {
            // continue, failure here is expected
        }
    }
    if (!allowRecursion)
        return undefined;
    if (typeof defaultExport === "object") {
        bootstrapScript += ".then(({ default }) => default)";
        if (typeof defaultExport.then === "function") {
            const awaitedDefaultExport = await defaultExport;
            return getBootstrapScript(root, bootstrapScript, awaitedDefaultExport);
        }
        else {
            return getBootstrapScript(root, bootstrapScript, defaultExport);
        }
    }
    return undefined;
}
async function ɵcodegenFunctionsDirectory(root, dest) {
    const bootstrapScript = await getBootstrapScript(root);
    if (!bootstrapScript)
        throw new Error("Cloud not find bootstrapScript");
    await (0, promises_1.mkdir)(dest, { recursive: true });
    const { packageJson } = await getConfig(root);
    const packResults = (0, child_process_1.execSync)(`npm pack ${root} --json`, { cwd: dest });
    const npmPackResults = JSON.parse(packResults.toString());
    const matchingPackResult = npmPackResults.find((it) => it.name === packageJson.name);
    const { filename } = matchingPackResult;
    packageJson.dependencies || (packageJson.dependencies = {});
    packageJson.dependencies[packageJson.name] = `file:${filename}`;
    return { bootstrapScript, packageJson };
}
exports.ɵcodegenFunctionsDirectory = ɵcodegenFunctionsDirectory;
//# sourceMappingURL=index.js.map
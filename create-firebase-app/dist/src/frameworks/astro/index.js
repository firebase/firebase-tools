"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDevModeHandle = exports.ɵcodegenFunctionsDirectory = exports.ɵcodegenPublicDirectory = exports.build = exports.discover = exports.supportedRange = exports.type = exports.support = exports.name = void 0;
const cross_spawn_1 = require("cross-spawn");
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const error_1 = require("../../error");
const utils_1 = require("../utils");
const utils_2 = require("./utils");
exports.name = "Astro";
exports.support = "experimental" /* SupportLevel.Experimental */;
exports.type = 2 /* FrameworkType.MetaFramework */;
exports.supportedRange = "2 - 4";
async function discover(dir) {
    if (!(0, fs_extra_1.existsSync)((0, path_1.join)(dir, "package.json")))
        return;
    const version = (0, utils_2.getAstroVersion)(dir);
    if (!version)
        return;
    const { output } = await (0, utils_2.getConfig)(dir);
    return {
        mayWantBackend: output !== "static",
        version,
    };
}
exports.discover = discover;
const DEFAULT_BUILD_SCRIPT = ["astro build"];
async function build(cwd) {
    const cli = (0, utils_1.getNodeModuleBin)("astro", cwd);
    await (0, utils_1.warnIfCustomBuildScript)(cwd, exports.name, DEFAULT_BUILD_SCRIPT);
    const { output, adapter } = await (0, utils_2.getConfig)(cwd);
    const wantsBackend = output !== "static";
    if (wantsBackend && (adapter === null || adapter === void 0 ? void 0 : adapter.name) !== "@astrojs/node") {
        throw new error_1.FirebaseError("Deploying an Astro application with SSR on Firebase Hosting requires the @astrojs/node adapter in middleware mode. https://docs.astro.build/en/guides/integrations-guide/node/");
    }
    const build = (0, cross_spawn_1.sync)(cli, ["build"], { cwd, stdio: "inherit" });
    if (build.status !== 0)
        throw new error_1.FirebaseError("Unable to build your Astro app");
    return { wantsBackend };
}
exports.build = build;
async function ɵcodegenPublicDirectory(root, dest) {
    const { outDir, output } = await (0, utils_2.getConfig)(root);
    // output: "server" in astro.config builds "client" and "server" folders, otherwise assets are in top-level outDir
    const assetPath = (0, path_1.join)(root, outDir, output !== "static" ? "client" : "");
    await (0, fs_extra_1.copy)(assetPath, dest);
}
exports.ɵcodegenPublicDirectory = ɵcodegenPublicDirectory;
async function ɵcodegenFunctionsDirectory(sourceDir, destDir) {
    const { outDir } = await (0, utils_2.getConfig)(sourceDir);
    const packageJson = await (0, utils_1.readJSON)((0, path_1.join)(sourceDir, "package.json"));
    await (0, fs_extra_1.copy)((0, path_1.join)(sourceDir, outDir, "server"), (0, path_1.join)(destDir));
    return {
        packageJson,
        bootstrapScript: (0, utils_2.getBootstrapScript)(),
    };
}
exports.ɵcodegenFunctionsDirectory = ɵcodegenFunctionsDirectory;
async function getDevModeHandle(cwd) {
    const host = new Promise((resolve, reject) => {
        const cli = (0, utils_1.getNodeModuleBin)("astro", cwd);
        const serve = (0, cross_spawn_1.spawn)(cli, ["dev"], { cwd });
        serve.stdout.on("data", (data) => {
            process.stdout.write(data);
            const match = data.toString().match(/(http:\/\/.+:\d+)/);
            if (match)
                resolve(match[1]);
        });
        serve.stderr.on("data", (data) => {
            process.stderr.write(data);
        });
        serve.on("exit", reject);
    });
    return (0, utils_1.simpleProxy)(await host);
}
exports.getDevModeHandle = getDevModeHandle;

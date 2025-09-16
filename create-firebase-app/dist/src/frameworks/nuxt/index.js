"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.init = exports.getConfig = exports.getDevModeHandle = exports.ɵcodegenFunctionsDirectory = exports.ɵcodegenPublicDirectory = exports.build = exports.discover = exports.supportedRange = exports.type = exports.support = exports.name = void 0;
const fs_extra_1 = require("fs-extra");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const semver_1 = require("semver");
const cross_spawn_1 = require("cross-spawn");
const utils_1 = require("../utils");
const utils_2 = require("./utils");
exports.name = "Nuxt";
exports.support = "experimental" /* SupportLevel.Experimental */;
exports.type = 4 /* FrameworkType.Toolchain */;
exports.supportedRange = "3";
const utils_3 = require("./utils");
const error_1 = require("../../error");
const child_process_1 = require("child_process");
const DEFAULT_BUILD_SCRIPT = ["nuxt build", "nuxi build"];
/**
 *
 * @param dir current directory
 * @return undefined if project is not Nuxt 2, { mayWantBackend: true, publicDirectory: string } otherwise
 */
async function discover(dir) {
    if (!(await (0, fs_extra_1.pathExists)((0, path_1.join)(dir, "package.json"))))
        return;
    const anyConfigFileExists = await (0, utils_3.nuxtConfigFilesExist)(dir);
    const version = (0, utils_2.getNuxtVersion)(dir);
    if (!anyConfigFileExists && !version)
        return;
    if (version && (0, semver_1.lt)(version, "3.0.0-0"))
        return;
    const { ssr: mayWantBackend } = await getConfig(dir);
    return { mayWantBackend, version };
}
exports.discover = discover;
async function build(cwd) {
    await (0, utils_1.warnIfCustomBuildScript)(cwd, exports.name, DEFAULT_BUILD_SCRIPT);
    const cli = (0, utils_1.getNodeModuleBin)("nuxt", cwd);
    const { ssr: wantsBackend, app: { baseURL: baseUrl }, } = await getConfig(cwd);
    const command = wantsBackend ? ["build"] : ["generate"];
    const build = (0, cross_spawn_1.sync)(cli, command, {
        cwd,
        stdio: "inherit",
        env: Object.assign(Object.assign({}, process.env), { NITRO_PRESET: "node" }),
    });
    if (build.status !== 0)
        throw new error_1.FirebaseError("Was unable to build your Nuxt application.");
    const rewrites = wantsBackend
        ? []
        : [
            {
                source: path_1.posix.join(baseUrl, "**"),
                destination: path_1.posix.join(baseUrl, "200.html"),
            },
        ];
    return { wantsBackend, rewrites, baseUrl };
}
exports.build = build;
async function ɵcodegenPublicDirectory(root, dest) {
    const { app: { baseURL }, } = await getConfig(root);
    const distPath = (0, path_1.join)(root, ".output", "public");
    const fullDest = (0, path_1.join)(dest, baseURL);
    await (0, fs_extra_1.mkdirp)(fullDest);
    await (0, fs_extra_1.copy)(distPath, fullDest);
}
exports.ɵcodegenPublicDirectory = ɵcodegenPublicDirectory;
async function ɵcodegenFunctionsDirectory(sourceDir) {
    const serverDir = (0, path_1.join)(sourceDir, ".output", "server");
    const packageJsonBuffer = await (0, promises_1.readFile)((0, path_1.join)(sourceDir, "package.json"));
    const packageJson = JSON.parse(packageJsonBuffer.toString());
    packageJson.dependencies || (packageJson.dependencies = {});
    packageJson.dependencies["nitro-output"] = `file:${serverDir}`;
    return { packageJson, frameworksEntry: "nitro" };
}
exports.ɵcodegenFunctionsDirectory = ɵcodegenFunctionsDirectory;
async function getDevModeHandle(cwd) {
    const host = new Promise((resolve, reject) => {
        const cli = (0, utils_1.getNodeModuleBin)("nuxt", cwd);
        const serve = (0, cross_spawn_1.spawn)(cli, ["dev"], { cwd: cwd });
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
async function getConfig(cwd) {
    const { loadNuxtConfig } = await (0, utils_1.relativeRequire)(cwd, "@nuxt/kit");
    return await loadNuxtConfig({ cwd });
}
exports.getConfig = getConfig;
/**
 * Utility method used during project initialization.
 */
function init(setup, config) {
    (0, child_process_1.execSync)(`npx --yes nuxi@"${exports.supportedRange}" init ${setup.hosting.source}`, {
        stdio: "inherit",
        cwd: config.projectDir,
    });
    return Promise.resolve();
}
exports.init = init;

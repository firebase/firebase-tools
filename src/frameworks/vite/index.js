"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDevModeHandle = exports.ɵcodegenPublicDirectory = exports.build = exports.discover = exports.vitePluginDiscover = exports.viteDiscoverWithNpmDependency = exports.init = exports.initViteTemplate = exports.DEFAULT_BUILD_SCRIPT = exports.supportedRange = exports.type = exports.support = exports.name = void 0;
const child_process_1 = require("child_process");
const cross_spawn_1 = require("cross-spawn");
const fs_1 = require("fs");
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const node_util_1 = require("node:util");
const prompt_1 = require("../../prompt");
const utils_1 = require("../utils");
exports.name = "Vite";
exports.support = "experimental" /* SupportLevel.Experimental */;
exports.type = 4 /* FrameworkType.Toolchain */;
exports.supportedRange = "3 - 6";
exports.DEFAULT_BUILD_SCRIPT = ["vite build", "tsc && vite build"];
const initViteTemplate = (template) => async (setup, config) => await init(setup, config, template);
exports.initViteTemplate = initViteTemplate;
async function init(setup, config, baseTemplate = "vanilla") {
    const template = await (0, prompt_1.select)({
        default: "JavaScript",
        message: "What language would you like to use?",
        choices: [
            { name: "JavaScript", value: baseTemplate },
            { name: "TypeScript", value: `${baseTemplate}-ts` },
        ],
    });
    (0, child_process_1.execSync)(`npm create vite@"${exports.supportedRange}" ${setup.hosting.source} --yes -- --template ${template}`, {
        stdio: "inherit",
        cwd: config.projectDir,
    });
    (0, child_process_1.execSync)(`npm install`, { stdio: "inherit", cwd: (0, path_1.join)(config.projectDir, setup.hosting.source) });
}
exports.init = init;
const viteDiscoverWithNpmDependency = (dep) => async (dir) => await discover(dir, undefined, dep);
exports.viteDiscoverWithNpmDependency = viteDiscoverWithNpmDependency;
const vitePluginDiscover = (plugin) => async (dir) => await discover(dir, plugin);
exports.vitePluginDiscover = vitePluginDiscover;
async function discover(dir, plugin, npmDependency) {
    if (!(0, fs_1.existsSync)((0, path_1.join)(dir, "package.json")))
        return;
    // If we're not searching for a vite plugin, depth has to be zero
    const additionalDep = npmDependency && (0, utils_1.findDependency)(npmDependency, { cwd: dir, depth: 0, omitDev: false });
    const depth = plugin ? undefined : 0;
    const configFilesExist = await Promise.all([
        (0, fs_extra_1.pathExists)((0, path_1.join)(dir, "vite.config.js")),
        (0, fs_extra_1.pathExists)((0, path_1.join)(dir, "vite.config.ts")),
    ]);
    const anyConfigFileExists = configFilesExist.some((it) => it);
    const version = (0, utils_1.findDependency)("vite", {
        cwd: dir,
        depth,
        omitDev: false,
    })?.version;
    if (!anyConfigFileExists && !version)
        return;
    if (npmDependency && !additionalDep)
        return;
    const { appType, publicDir: publicDirectory, plugins } = await getConfig(dir);
    if (plugin && !plugins.find(({ name }) => name === plugin))
        return;
    return {
        mayWantBackend: appType !== "spa",
        publicDirectory,
        version,
        vite: true,
    };
}
exports.discover = discover;
async function build(root, target) {
    const { build } = await (0, utils_1.relativeRequire)(root, "vite");
    await (0, utils_1.warnIfCustomBuildScript)(root, exports.name, exports.DEFAULT_BUILD_SCRIPT);
    // SvelteKit uses process.cwd() unfortunately, chdir
    const cwd = process.cwd();
    process.chdir(root);
    const originalNodeEnv = process.env.NODE_ENV;
    // Downcasting as `string` as otherwise it is inferred as `readonly 'NODE_ENV'`,
    // but `env[key]` expects a non-readonly variable.
    const envKey = "NODE_ENV";
    // Voluntarily making .env[key] not statically analyzable to avoid
    // Webpack from converting it to "development" = target;
    process.env[envKey] = target;
    await build({ root, mode: target });
    process.chdir(cwd);
    // Voluntarily making .env[key] not statically analyzable to avoid
    // Webpack from converting it to "development" = target;
    process.env[envKey] = originalNodeEnv;
    return { rewrites: [{ source: "**", destination: "/index.html" }] };
}
exports.build = build;
async function ɵcodegenPublicDirectory(root, dest) {
    const viteConfig = await getConfig(root);
    const viteDistPath = (0, path_1.join)(root, viteConfig.build.outDir);
    await (0, fs_extra_1.copy)(viteDistPath, dest);
}
exports.ɵcodegenPublicDirectory = ɵcodegenPublicDirectory;
async function getDevModeHandle(dir) {
    const host = new Promise((resolve, reject) => {
        // Can't use scheduleTarget since that—like prerender—is failing on an ESM bug
        // will just grep for the hostname
        const cli = (0, utils_1.getNodeModuleBin)("vite", dir);
        const serve = (0, cross_spawn_1.spawn)(cli, [], { cwd: dir });
        serve.stdout.on("data", (data) => {
            process.stdout.write(data);
            const dataWithoutAnsiCodes = (0, node_util_1.stripVTControlCharacters)(data.toString());
            const match = dataWithoutAnsiCodes.match(/(http:\/\/.+:\d+)/);
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
async function getConfig(root) {
    const { resolveConfig } = await (0, utils_1.relativeRequire)(root, "vite");
    // SvelteKit uses process.cwd() unfortunately, we should be defensive here
    const cwd = process.cwd();
    process.chdir(root);
    const config = await resolveConfig({ root }, "build", "production");
    process.chdir(cwd);
    return config;
}
//# sourceMappingURL=index.js.map
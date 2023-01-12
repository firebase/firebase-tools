"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDevModeHandle = exports.ɵcodegenPublicDirectory = exports.build = exports.discover = exports.init = exports.type = exports.support = exports.name = void 0;
const child_process_1 = require("child_process");
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const { dynamicImport } = require(true && "../../dynamicImport");
const proxy_1 = require("../../hosting/proxy");
const promises_1 = require("fs/promises");
exports.name = "Astro";
exports.support = "experimental";
exports.type = 4;
const CLI_COMMAND = (0, path_1.join)("node_modules", ".bin", process.platform === "win32" ? "astro.cmd" : "astro");
const SERVER_DIR = 'dist/server'


async function init(setup, baseTemplate = "vanilla") {
    (0, child_process_1.execSync)(`npm create astro@latest ${setup.hosting.source}`, {
        stdio: "inherit",
    });
    (0, child_process_1.execSync)(`npm install`, { stdio: "inherit", cwd: setup.hosting.source });
}
exports.init = init;

async function discover(dir) {
    if (!(await (0, fs_extra_1.pathExists)((0, path_1.join)(dir, "package.json"))))
        return;
    if (!(await (0, fs_extra_1.pathExists)((0, path_1.join)(dir, "astro.config.mjs"))))
        return;
    return { mayWantBackend: true, publicDirectory: (0, path_1.join)(dir, "public") };
}
exports.discover = discover;

async function build(cwd) {
    (0, child_process_1.execSync)(`npm run build`, { stdio: "inherit", cwd });
    const config = await dynamicImport((0, path_1.join)(cwd, "astro.config.mjs"))
    const wantsBackend = config.default.output === 'server';
    return { wantsBackend };
}
exports.build = build;

async function ɵcodegenPublicDirectory(root, dest) {
    const config = await dynamicImport((0, path_1.join)(root, "astro.config.mjs"))
    if (config.default.output === 'server')
        await (0, fs_extra_1.copy)(`${root}/dist/client`, dest);
    else
        await (0, fs_extra_1.copy)(`${root}/dist`, dest);
}
exports.ɵcodegenPublicDirectory = ɵcodegenPublicDirectory;

async function getBootstrapScript(root, _bootstrapScript = "", _entry) {
    let entry = _entry;
    let bootstrapScript = _bootstrapScript;
    const allowRecursion = !entry;
    if (!entry) {
        const entry_script = `${root}/${SERVER_DIR}/entry.mjs`
        entry = await dynamicImport(entry_script).catch(() => undefined);
        bootstrapScript = `const bootstrap = import('./entry.mjs')`;
    }
    if (!entry)
        return undefined;
    const { default: defaultExport, app, handler } = entry;
    if (typeof handler === "function") {
        return (bootstrapScript +
            ";\nexports.handle = async (req, res) => (await bootstrap).handler(req, res);");
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
        return;
    await (0, promises_1.mkdir)(dest, { recursive: true });
    const packageJsonBuffer = await (0, promises_1.readFile)((0, path_1.join)(root, "package.json"));
    const packageJson = JSON.parse(packageJsonBuffer.toString());
    delete packageJson.scripts
    await (0, fs_extra_1.copy)(`${root}/${SERVER_DIR}`, dest);
    return { bootstrapScript, packageJson };
}
exports.ɵcodegenFunctionsDirectory = ɵcodegenFunctionsDirectory;


async function getDevModeHandle(dir) {
    process.env['NODE_ENV'] = 'developpement'
    const host = new Promise((resolve) => {
        const serve = (0, child_process_1.spawn)(CLI_COMMAND, ['dev'], { cwd: dir });
        serve.stdout.on("data", (data) => {
            process.stdout.write(data);
            const match = data.toString().match(/(http:\/\/.+:\d+)/);
            if (match)
                resolve(match[1]);
        });
        serve.stderr.on("data", (data) => {
            process.stderr.write(data);
        });
    });
    return (0, proxy_1.proxyRequestHandler)(await host, "Astro", { forceCascade: true });
}
exports.getDevModeHandle = getDevModeHandle;
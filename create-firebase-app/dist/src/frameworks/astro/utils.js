"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAstroVersion = exports.getConfig = exports.getBootstrapScript = void 0;
const path_1 = require("path");
const utils_1 = require("../utils");
const semver_1 = require("semver");
const url_1 = require("url");
const { dynamicImport } = require(true && "../../dynamicImport");
function getBootstrapScript() {
    // `astro build` with node adapter in middleware mode will generate a middleware at entry.mjs
    // need to convert the export to `handle` to work with express integration
    return `const entry = import('./entry.mjs');\nexport const handle = async (req, res) => (await entry).handler(req, res)`;
}
exports.getBootstrapScript = getBootstrapScript;
async function getConfig(cwd) {
    const astroDirectory = (0, path_1.dirname)(require.resolve("astro/package.json", { paths: [cwd] }));
    const version = getAstroVersion(cwd);
    let config;
    const configPath = (0, path_1.join)(astroDirectory, "dist", "core", "config", "config.js");
    if ((0, semver_1.gte)(version, "2.9.7")) {
        const { resolveConfig } = await dynamicImport(configPath);
        const { astroConfig } = await resolveConfig({ root: cwd }, "build");
        config = astroConfig;
    }
    else {
        const { openConfig } = await dynamicImport(configPath);
        const logging = undefined; // TODO figure out the types here
        const { astroConfig } = await openConfig({ cmd: "build", cwd, logging });
        config = astroConfig;
    }
    return {
        outDir: (0, path_1.relative)(cwd, (0, url_1.fileURLToPath)(config.outDir)),
        publicDir: (0, path_1.relative)(cwd, (0, url_1.fileURLToPath)(config.publicDir)),
        output: config.output,
        adapter: config.adapter,
    };
}
exports.getConfig = getConfig;
function getAstroVersion(cwd) {
    var _a;
    return (_a = (0, utils_1.findDependency)("astro", { cwd, depth: 0, omitDev: false })) === null || _a === void 0 ? void 0 : _a.version;
}
exports.getAstroVersion = getAstroVersion;

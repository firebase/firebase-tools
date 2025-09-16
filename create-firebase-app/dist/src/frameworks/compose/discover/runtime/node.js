"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodejsRuntime = void 0;
const filesystem_1 = require("../filesystem");
const frameworkMatcher_1 = require("../frameworkMatcher");
const error_1 = require("../../../../error");
const logger_1 = require("../../../../logger");
const utils_1 = require("../../../utils");
const supportedNodeVersions = ["18"];
const NODE_RUNTIME_ID = "nodejs";
const PACKAGE_JSON = "package.json";
const YARN_LOCK = "yarn.lock";
class NodejsRuntime {
    constructor() {
        this.runtimeRequiredFiles = [PACKAGE_JSON];
    }
    // Checks if the codebase is using Node as runtime.
    async match(fs) {
        const areAllFilesPresent = await Promise.all(this.runtimeRequiredFiles.map((file) => fs.exists(file)));
        return areAllFilesPresent.every((present) => present);
    }
    getRuntimeName() {
        return NODE_RUNTIME_ID;
    }
    getNodeImage(engine) {
        // If no version is mentioned explicitly, assuming application is compatible with latest version.
        if (!engine || !engine.node) {
            return "us-docker.pkg.dev/firestack-build/test/run";
        }
        const versionNumber = engine.node;
        if (!supportedNodeVersions.includes(versionNumber)) {
            throw new error_1.FirebaseError(`This integration expects Node version ${(0, utils_1.conjoinOptions)(supportedNodeVersions, "or")}. You're running version ${versionNumber}, which is not compatible.`);
        }
        return "us-docker.pkg.dev/firestack-build/test/run";
    }
    async getPackageManager(fs) {
        try {
            if (await fs.exists(YARN_LOCK)) {
                return "yarn";
            }
            return "npm";
        }
        catch (error) {
            logger_1.logger.error("Failed to check files to identify package manager");
            throw error;
        }
    }
    getDependencies(packageJSON) {
        return Object.assign(Object.assign({}, packageJSON.dependencies), packageJSON.devDependencies);
    }
    packageManagerInstallCommand(packageManager) {
        const packages = [];
        if (packageManager === "yarn") {
            packages.push("yarn");
        }
        if (!packages.length) {
            return undefined;
        }
        return `npm install --global ${packages.join(" ")}`;
    }
    installCommand(fs, packageManager) {
        let installCmd = "npm install";
        if (packageManager === "yarn") {
            installCmd = "yarn install";
        }
        return installCmd;
    }
    async detectedCommands(packageManager, scripts, matchedFramework, fs) {
        return {
            build: this.getBuildCommand(packageManager, scripts, matchedFramework),
            dev: this.getDevCommand(packageManager, scripts, matchedFramework),
            run: await this.getRunCommand(packageManager, scripts, matchedFramework, fs),
        };
    }
    executeScript(packageManager, scriptName) {
        return `${packageManager} run ${scriptName}`;
    }
    executeFrameworkCommand(packageManager, command) {
        if (packageManager === "npm" || packageManager === "yarn") {
            command.cmd = "npx " + command.cmd;
        }
        return command;
    }
    getBuildCommand(packageManager, scripts, matchedFramework) {
        var _a;
        let buildCommand = { cmd: "" };
        if (scripts === null || scripts === void 0 ? void 0 : scripts.build) {
            buildCommand.cmd = this.executeScript(packageManager, "build");
        }
        else if (matchedFramework && ((_a = matchedFramework.commands) === null || _a === void 0 ? void 0 : _a.build)) {
            buildCommand = matchedFramework.commands.build;
            buildCommand = this.executeFrameworkCommand(packageManager, buildCommand);
        }
        return buildCommand.cmd === "" ? undefined : buildCommand;
    }
    getDevCommand(packageManager, scripts, matchedFramework) {
        var _a;
        let devCommand = { cmd: "", env: { NODE_ENV: "dev" } };
        if (scripts === null || scripts === void 0 ? void 0 : scripts.dev) {
            devCommand.cmd = this.executeScript(packageManager, "dev");
        }
        else if (matchedFramework && ((_a = matchedFramework.commands) === null || _a === void 0 ? void 0 : _a.dev)) {
            devCommand = matchedFramework.commands.dev;
            devCommand = this.executeFrameworkCommand(packageManager, devCommand);
        }
        return devCommand.cmd === "" ? undefined : devCommand;
    }
    async getRunCommand(packageManager, scripts, matchedFramework, fs) {
        var _a;
        let runCommand = { cmd: "", env: { NODE_ENV: "production" } };
        if (scripts === null || scripts === void 0 ? void 0 : scripts.start) {
            runCommand.cmd = this.executeScript(packageManager, "start");
        }
        else if (matchedFramework && ((_a = matchedFramework.commands) === null || _a === void 0 ? void 0 : _a.run)) {
            runCommand = matchedFramework.commands.run;
            runCommand = this.executeFrameworkCommand(packageManager, runCommand);
        }
        else if (scripts === null || scripts === void 0 ? void 0 : scripts.main) {
            runCommand.cmd = `node ${scripts.main}`;
        }
        else if (await fs.exists("index.js")) {
            runCommand.cmd = `node index.js`;
        }
        return runCommand.cmd === "" ? undefined : runCommand;
    }
    async analyseCodebase(fs, allFrameworkSpecs) {
        try {
            const packageJSONRaw = await (0, filesystem_1.readOrNull)(fs, PACKAGE_JSON);
            let packageJSON = {};
            if (packageJSONRaw) {
                packageJSON = JSON.parse(packageJSONRaw);
            }
            const packageManager = await this.getPackageManager(fs);
            const nodeImage = this.getNodeImage(packageJSON.engines);
            const dependencies = this.getDependencies(packageJSON);
            const matchedFramework = await (0, frameworkMatcher_1.frameworkMatcher)(NODE_RUNTIME_ID, fs, allFrameworkSpecs, dependencies);
            const runtimeSpec = {
                id: NODE_RUNTIME_ID,
                baseImage: nodeImage,
                packageManagerInstallCommand: this.packageManagerInstallCommand(packageManager),
                installCommand: this.installCommand(fs, packageManager),
                detectedCommands: await this.detectedCommands(packageManager, packageJSON.scripts, matchedFramework, fs),
            };
            return runtimeSpec;
        }
        catch (error) {
            throw new error_1.FirebaseError(`Failed to parse engine: ${error}`);
        }
    }
}
exports.NodejsRuntime = NodejsRuntime;
